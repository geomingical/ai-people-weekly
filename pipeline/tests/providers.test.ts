import { describe, expect, it } from 'vitest';
import { buildProviders, firstKey, type SummarizerConfig } from '../src/summarize/providers';

const config: SummarizerConfig = {
  maxInputChars: 24_000,
  maxOutputTokens: 2000,
  providers: [
    {
      id: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia/nemotron',
      apiKeyEnv: ['AI_EDU_API_KEY', 'NVIDIA_API_KEY'],
      reasoningEffort: 'none',
      jsonMode: 'json-schema',
    },
    {
      id: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKeyEnv: ['AI_EDU_FALLBACK_API_KEY', 'DEEPSEEK_API_KEY'],
      jsonMode: 'json-object',
    },
  ],
};

describe('firstKey', () => {
  it('takes the first name that has a value', () => {
    expect(firstKey(['A', 'B'], { B: 'second' })).toBe('second');
    expect(firstKey(['A', 'B'], { A: 'first', B: 'second' })).toBe('first');
  });

  it('treats an empty value as absent', () => {
    expect(firstKey(['A'], { A: '' })).toBeNull();
  });

  it('returns null when nothing is set', () => {
    expect(firstKey(['A', 'B'], {})).toBeNull();
  });
});

describe('buildProviders', () => {
  it('keeps the configured order — the first entry is the primary', () => {
    const { providers } = buildProviders(config, { NVIDIA_API_KEY: 'k1', DEEPSEEK_API_KEY: 'k2' });
    expect(providers.map((entry) => entry.id)).toEqual(['nvidia', 'deepseek']);
  });

  it('carries each provider’s own model and JSON mode', () => {
    const { providers } = buildProviders(config, { NVIDIA_API_KEY: 'k1', DEEPSEEK_API_KEY: 'k2' });
    expect(providers[0]).toMatchObject({ model: 'nvidia/nemotron', jsonMode: 'json-schema', reasoningEffort: 'none' });
    expect(providers[1]).toMatchObject({ model: 'deepseek-v4-flash', jsonMode: 'json-object' });
  });

  // Running with only the primary configured is a normal local state, and so is
  // running with none — the stories publish with their source's own summary.
  it('skips a provider whose key is absent, without failing', () => {
    const { providers, skipped } = buildProviders(config, { NVIDIA_API_KEY: 'k1' });
    expect(providers.map((entry) => entry.id)).toEqual(['nvidia']);
    expect(skipped).toEqual(['deepseek']);
  });

  it('promotes the fallback when only its key is present', () => {
    const { providers, skipped } = buildProviders(config, { DEEPSEEK_API_KEY: 'k2' });
    expect(providers.map((entry) => entry.id)).toEqual(['deepseek']);
    expect(skipped).toEqual(['nvidia']);
  });

  it('returns nothing rather than throwing when no key is set', () => {
    const { providers, skipped } = buildProviders(config, {});
    expect(providers).toEqual([]);
    expect(skipped).toEqual(['nvidia', 'deepseek']);
  });

  it('prefers the deployment-specific variable over the vendor one', () => {
    const { providers } = buildProviders(config, {
      AI_EDU_API_KEY: 'deployment',
      NVIDIA_API_KEY: 'local',
    });
    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe('nvidia');
  });
});

describe('the shipped agents.json', () => {
  it('parses and names a primary and at least one fallback', async () => {
    const raw = await import('../config/agents.json', { with: { type: 'json' } });
    const shipped = (raw.default as { summarizer: SummarizerConfig }).summarizer;
    expect(shipped.providers.length).toBeGreaterThanOrEqual(2);
    // Two vendors, not two entries pointing at the same one — a fallback on the
    // same host would go down with the primary.
    const hosts = new Set(shipped.providers.map((spec) => new URL(spec.baseUrl).hostname));
    expect(hosts.size).toBe(shipped.providers.length);
  });

  it('gives every provider a key source and a JSON mode', () => {
    return import('../config/agents.json', { with: { type: 'json' } }).then((raw) => {
      const shipped = (raw.default as { summarizer: SummarizerConfig }).summarizer;
      for (const spec of shipped.providers) {
        expect(spec.apiKeyEnv.length).toBeGreaterThan(0);
        expect(['json-schema', 'json-object', 'none']).toContain(spec.jsonMode);
      }
    });
  });
});
