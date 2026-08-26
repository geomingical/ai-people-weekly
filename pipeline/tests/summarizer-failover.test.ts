import { describe, expect, it } from 'vitest';
import { summarizeAll, type ProviderConfig, type SummaryInput } from '../src/summarize/summarizer';

// This layer lives inside summarizeAll, where the harness cannot reach: the
// harness replaces summarizeAll entirely, so a test built on it proves the
// report aggregation and nothing about whether the fallback ever runs. The
// production summarizer could abandon a batch the moment NVIDIA returned 503
// and that test would still be green.
//
// Measured during the feasibility run: NVIDIA returned 503 on every batch and
// only succeeded on the third attempt. The fallback is not insurance, it is
// something this site uses.

const input: SummaryInput[] = [
  { id: 'a', title: 'A study of companion chatbots', summary: 'x'.repeat(500), sourceName: 's' },
];

const reply = JSON.stringify({
  items: [{ index: 0, title: '陪伴型聊天機器人研究', summary: '研究追蹤使用者六個月。' }],
});

const provider = (
  id: string,
  respond: () => { ok: boolean },
  calls: string[],
): ProviderConfig => ({
  id,
  model: 'm',
  maxOutputTokens: 512,
  jsonMode: 'json-schema',
  transport: async () => {
    calls.push(id);
    return respond().ok
      ? { content: reply, meta: { status: 200, durationMs: 12, completionTokens: 90 }, error: null }
      : {
          content: null,
          meta: { status: 503, durationMs: 5 },
          error: { kind: 'http' as const, status: 503, message: 'overloaded' },
        };
  },
});

const noWait = { sleep: async () => {}, random: () => 0, now: () => 0 };

describe('the fallback provider actually takes over', () => {
  it('moves to the second provider after the first fails, and uses its output', async () => {
    const calls: string[] = [];
    const result = await summarizeAll(
      input,
      [
        provider('nvidia', () => ({ ok: false }), calls),
        provider('groq', () => ({ ok: true }), calls),
      ],
      noWait,
    );

    // Order matters: the primary must be tried first, and the fallback must run.
    expect(calls[0]).toBe('nvidia');
    expect(calls).toContain('groq');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.titleZhTW).toBe('陪伴型聊天機器人研究');
    // The attempts come from a real pass through the provider loop, not from
    // a list handed to the report.
    expect(result.attempts.map((attempt) => attempt.provider)).toContain('groq');
  });

  it('reports a failure rather than inventing a summary when both providers fail', async () => {
    const calls: string[] = [];
    const result = await summarizeAll(
      input,
      [
        provider('nvidia', () => ({ ok: false }), calls),
        provider('groq', () => ({ ok: false }), calls),
      ],
      noWait,
    );
    expect(result.outputs).toHaveLength(0);
    expect(result.failures).toBe(1);
    expect(calls).toContain('nvidia');
    expect(calls).toContain('groq');
  });

  it('does not call the fallback when the primary succeeds', async () => {
    const calls: string[] = [];
    const result = await summarizeAll(
      input,
      [
        provider('nvidia', () => ({ ok: true }), calls),
        provider('groq', () => ({ ok: true }), calls),
      ],
      noWait,
    );
    expect(calls).toEqual(['nvidia']);
    expect(result.outputs).toHaveLength(1);
  });
});
