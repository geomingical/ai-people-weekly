import { describe, expect, it } from 'vitest';
import { summarizeAttempts } from '../src/run';

const failed = (outcome: string) => outcome !== 'ok';

// Zeros satisfy an assertion written against an empty attempt list, so every
// case here uses a non-empty one and asserts exact numbers.
describe('summarizeAttempts', () => {
  it('counts three requests to one provider as two retries and no failover', () => {
    const usage = summarizeAttempts(
      [
        { provider: 'nvidia', batch: 0, outcome: 'http-error' },
        { provider: 'nvidia', batch: 0, outcome: 'http-error' },
        { provider: 'nvidia', batch: 0, outcome: 'ok', completionTokens: 240 },
      ],
      failed,
    );
    expect(usage).toMatchObject({
      calls: 3,
      retries: 2,
      failovers: 0,
      failures: 2,
      completionTokens: 240,
      tokensUnreported: 2,
      byProvider: { nvidia: { served: 1, failed: 2 } },
    });
  });

  // One request each to two providers for one batch is a failover, not a retry.
  it('counts a move to another provider as a failover', () => {
    const usage = summarizeAttempts(
      [
        { provider: 'nvidia', batch: 0, outcome: 'http-error' },
        { provider: 'groq', batch: 0, outcome: 'ok', completionTokens: 310 },
      ],
      failed,
    );
    expect(usage).toMatchObject({
      calls: 2,
      retries: 0,
      failovers: 1,
      failures: 1,
      completionTokens: 310,
      tokensUnreported: 1,
      byProvider: { nvidia: { served: 0, failed: 1 }, groq: { served: 1, failed: 0 } },
    });
  });

  it('keeps batches separate', () => {
    const usage = summarizeAttempts(
      [
        { provider: 'nvidia', batch: 0, outcome: 'ok', completionTokens: 10 },
        { provider: 'nvidia', batch: 1, outcome: 'ok', completionTokens: 20 },
      ],
      failed,
    );
    expect(usage.retries).toBe(0);
    expect(usage.failovers).toBe(0);
    expect(usage.completionTokens).toBe(30);
  });

  // A 503 carries no token count. Counting it as zero would make the run look
  // cheaper than it was.
  it('tallies unreported token counts separately from zero', () => {
    const usage = summarizeAttempts(
      [{ provider: 'nvidia', batch: 0, outcome: 'http-error' }],
      failed,
    );
    expect(usage.completionTokens).toBe(0);
    expect(usage.tokensUnreported).toBe(1);
  });
});
