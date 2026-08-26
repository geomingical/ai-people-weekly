import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpTransport, parseRetryAfter, type ChatRequest } from '../src/summarize/transport';

const request: ChatRequest = {
  model: 'test-model',
  maxOutputTokens: 100,
  timeoutMs: 5_000,
  messages: [{ role: 'system', content: 'sys' }],
};

function chatBody(content: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
    ...extra,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-08-19T00:00:00Z');

  it('reads delta-seconds', () => {
    expect(parseRetryAfter('30', now)).toBe(30_000);
  });

  it('reads an HTTP date', () => {
    expect(parseRetryAfter('Wed, 19 Aug 2026 00:00:45 GMT', now)).toBe(45_000);
  });

  // A malformed header must never produce a bogus sleep.
  it.each([
    ['a missing header', null],
    ['an empty header', '   '],
    ['prose', 'soon'],
    ['a date already in the past', 'Wed, 19 Aug 2026 00:00:00 GMT'],
    ['a negative value', '-5'],
  ])('returns undefined for %s', (_label, value) => {
    expect(parseRetryAfter(value, now)).toBeUndefined();
  });

  it('caps an absurd value at two minutes', () => {
    expect(parseRetryAfter('99999', now)).toBe(120_000);
  });
});

// The transport must never throw: a failing model degrades the run to
// source-verbatim summaries rather than ending it.
describe('createHttpTransport', () => {
  it('returns the assistant message with its metadata', async () => {
    vi.stubGlobal('fetch', async () => new Response(chatBody('hello'), { status: 200 }));
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    const result = await transport(request);
    expect(result.content).toBe('hello');
    expect(result.error).toBeNull();
    expect(result.meta).toMatchObject({
      status: 200,
      finishReason: 'stop',
      completionTokens: 20,
    });
  });

  it('sends the bearer token and the chat-completions path', async () => {
    const spy = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(chatBody('x'), { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    // A trailing slash on the base URL must not produce a double slash.
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1/', apiKey: 'secret' });
    await transport(request);

    const call = spy.mock.calls[0];
    expect(call?.[0]).toBe('https://api.test/v1/chat/completions');
    const headers = call?.[1].headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer secret');
  });

  // Measured on the real endpoint: the same trivial request spent 113
  // completion tokens with reasoning on and 29 with it off. Left on, that
  // hidden work can consume the output budget before the JSON is closed.
  it('sends reasoning_effort only when asked for', async () => {
    const spy = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(chatBody('x'), { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });

    await transport(request);
    expect(JSON.parse(String(spy.mock.calls[0]?.[1].body))).not.toHaveProperty('reasoning_effort');

    await transport({ ...request, reasoningEffort: 'none' });
    expect(JSON.parse(String(spy.mock.calls[1]?.[1].body))).toMatchObject({
      reasoning_effort: 'none',
    });
  });

  it('reports a non-2xx status as a typed http failure', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    const result = await transport(request);
    expect(result.content).toBeNull();
    expect(result.error).toMatchObject({ kind: 'http', status: 503 });
  });

  it('carries a Retry-After header through to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('slow down', { status: 429, headers: { 'retry-after': '20' } }),
    );
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    const result = await transport(request);
    expect(result.error).toMatchObject({ kind: 'http', status: 429, retryAfterMs: 20_000 });
  });

  it('captures the provider request id for correlation', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(chatBody('x'), { status: 200, headers: { 'nvcf-reqid': 'abc-123' } }),
    );
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    expect((await transport(request)).meta.requestId).toBe('abc-123');
  });

  it('reports a reply with no message content', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    expect((await transport(request)).error).toMatchObject({ kind: 'empty-content' });
  });

  it('reports a malformed JSON body distinctly from a socket failure', async () => {
    vi.stubGlobal('fetch', async () => new Response('not json', { status: 200 }));
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    expect((await transport(request)).error).toMatchObject({ kind: 'malformed-body' });
  });

  it('reports a socket failure', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNRESET');
    });
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    expect((await transport(request)).error).toMatchObject({ kind: 'network' });
  });

  it('reports a timeout distinctly from a socket failure', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
    );
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'k' });
    expect((await transport({ ...request, timeoutMs: 10 })).error).toMatchObject({
      kind: 'timeout',
    });
  });

  // The message goes into run reports and CI logs.
  it('never puts the API key in an error message', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('failed to connect');
    });
    const transport = createHttpTransport({ baseUrl: 'https://api.test/v1', apiKey: 'super-secret' });
    const result = await transport(request);
    expect(JSON.stringify(result)).not.toContain('super-secret');
  });
});
