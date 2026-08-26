// The only place the pipeline talks to a language model.
//
// Injected as an interface so the summarizer and its tests never open a socket.
// The wire format is OpenAI-compatible chat completions, which is what NVIDIA's
// integrate.api, OpenAI, and most gateways all speak — swapping provider means
// changing a base URL and a model name in pipeline/config/agents.json, not code.
//
// This layer makes exactly ONE attempt and never throws. It does not retry:
// only the summarizer knows whether a 200 response actually passed batch
// validation, so a retry loop hidden down here could not make the right call
// and would double the wire calls invisibly. What this layer owes the caller is
// honest, typed information about what happened — not a decision.

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Milliseconds for this attempt. The caller varies it per attempt. */
  timeoutMs: number;
  /**
   * Nemotron 3 is a reasoning model whose hosted API defaults to a high
   * reasoning effort with its own large token budget. Measured on the real
   * endpoint: the same trivial request spent 113 completion tokens by default
   * and 29 with reasoning off. For a constrained translate-and-summarize job
   * that hidden work buys nothing and can consume the output budget before the
   * JSON is closed — which arrives as an unparseable reply, indistinguishable
   * from the model simply answering badly. Default it off; keep it settable so
   * a model that needs reasoning can have it.
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  /**
   * Server-side constrained decoding, when the provider supports it. This is
   * the root fix for malformed replies rather than a workaround: the first
   * live backfill produced content that was entirely correct inside replies
   * whose ARRAY PUNCTUATION was broken — a missing comma between elements, an
   * array closed early, a doubled bracket. Constraining the decoder makes that
   * class of failure impossible instead of parsing around it.
   *
   * It does not replace validation. The schema fixes structure; the summarizer
   * still enforces index range and uniqueness, field lengths, and the no-URL,
   * no-markup rule that the injection defence depends on.
   */
  responseFormat?: unknown;
}

/** Why an attempt produced no usable content. Typed, so the caller can decide
 *  retryability from data rather than by matching on prose. */
export interface TransportFailure {
  kind: 'timeout' | 'network' | 'http' | 'malformed-body' | 'empty-content';
  status?: number;
  /** Parsed from a `Retry-After` header when the server sent a usable one. */
  retryAfterMs?: number;
  requestId?: string;
  /** Safe for logs: never contains response body text or credentials. */
  message: string;
}

export interface ChatMeta {
  status?: number;
  /** `stop`, `length`, … — `length` means the reply was cut off, which is a
   *  budget problem to fix, not a rate problem to back off from. */
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  requestId?: string;
  durationMs: number;
}

export type ChatResponse =
  | { content: string; meta: ChatMeta; error: null }
  | { content: null; meta: ChatMeta; error: TransportFailure };

export type ChatTransport = (request: ChatRequest) => Promise<ChatResponse>;

export interface TransportOptions {
  baseUrl: string;
  apiKey: string;
  now?: () => number;
}

const MAX_RETRY_AFTER_MS = 120_000;

/**
 * Reads a `Retry-After` header in either accepted form — delta-seconds or an
 * HTTP date. Returns undefined for anything absent, unparseable, or negative,
 * so a malformed header can never produce a bogus sleep.
 */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Number.isFinite(ms) ? Math.min(ms, MAX_RETRY_AFTER_MS) : undefined;
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  const delta = dateMs - nowMs;
  if (delta <= 0) return undefined;
  return Math.min(delta, MAX_RETRY_AFTER_MS);
}

/**
 * Never throws: every failure — non-2xx, malformed body, timeout, socket error
 * — comes back as a typed `TransportFailure`. A failing model degrades the run
 * to source-verbatim summaries; it does not end it.
 */
export function createHttpTransport(options: TransportOptions): ChatTransport {
  const now = options.now ?? Date.now;

  return async (request) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const started = now();
    const elapsed = () => now() - started;

    try {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxOutputTokens,
        // Summarizing is not a creative task, and a low setting makes a re-run
        // of the same week produce close to the same text.
        temperature: 0.2,
      };
      if (request.reasoningEffort !== undefined) {
        body['reasoning_effort'] = request.reasoningEffort;
      }
      if (request.responseFormat !== undefined) {
        body['response_format'] = request.responseFormat;
      }

      const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      // Correlation id for support, safe to log. NVIDIA sends nvcf-reqid; other
      // gateways use x-request-id.
      const requestId =
        response.headers.get('nvcf-reqid') ?? response.headers.get('x-request-id') ?? undefined;

      if (!response.ok) {
        return {
          content: null,
          meta: { status: response.status, requestId, durationMs: elapsed() },
          error: {
            kind: 'http',
            status: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get('retry-after'), now()),
            requestId,
            message: `model API returned HTTP ${response.status}`,
          },
        };
      }

      let payload: {
        choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        return {
          content: null,
          meta: { status: response.status, requestId, durationMs: elapsed() },
          error: {
            kind: 'malformed-body',
            status: response.status,
            requestId,
            message: 'model API returned a body that is not JSON',
          },
        };
      }

      const choice = payload.choices?.[0];
      const meta: ChatMeta = {
        status: response.status,
        finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined,
        promptTokens:
          typeof payload.usage?.prompt_tokens === 'number' ? payload.usage.prompt_tokens : undefined,
        completionTokens:
          typeof payload.usage?.completion_tokens === 'number'
            ? payload.usage.completion_tokens
            : undefined,
        requestId,
        durationMs: elapsed(),
      };

      const content = choice?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        return {
          content: null,
          meta,
          error: {
            kind: 'empty-content',
            status: response.status,
            requestId,
            message: 'model API returned no message content',
          },
        };
      }

      return { content, meta, error: null };
    } catch (error) {
      const aborted = controller.signal.aborted;
      return {
        content: null,
        meta: { durationMs: elapsed() },
        error: aborted
          ? { kind: 'timeout', message: `model API call timed out after ${request.timeoutMs}ms` }
          : { kind: 'network', message: `model API call failed: ${(error as Error).message}` },
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
