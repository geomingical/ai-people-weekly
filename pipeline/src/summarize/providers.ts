// Builds the ordered provider list from config and the environment.
//
// A provider whose key is absent is skipped silently rather than treated as a
// failure: running with only NVIDIA configured is a normal local state, and so
// is running with none at all — the stories simply publish with their source's
// own summary.
//
// Order matters and is the config's, not this file's. The first entry is the
// primary; the rest exist because a provider outage should cost nothing
// visible. NVIDIA's free tier returned 503 repeatedly during development.

import { createHttpTransport } from './transport';
import type { ProviderConfig } from './summarizer';

export interface ProviderSpec {
  id: string;
  baseUrl: string;
  model: string;
  /** Environment variables to try, in order, for this provider's key. */
  apiKeyEnv: string[];
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  jsonMode: ProviderConfig['jsonMode'];
}

export interface SummarizerConfig {
  maxInputChars: number;
  maxOutputTokens: number;
  providers: ProviderSpec[];
}

export function firstKey(
  names: readonly string[],
  env: Record<string, string | undefined>,
): string | null {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value.length > 0) return value;
  }
  return null;
}

export interface BuiltProviders {
  providers: ProviderConfig[];
  /** Providers skipped for want of a key, for the run report. Names only. */
  skipped: string[];
}

export function buildProviders(
  config: SummarizerConfig,
  env: Record<string, string | undefined>,
): BuiltProviders {
  const providers: ProviderConfig[] = [];
  const skipped: string[] = [];

  for (const spec of config.providers) {
    const apiKey = firstKey(spec.apiKeyEnv, env);
    if (apiKey === null) {
      skipped.push(spec.id);
      continue;
    }
    providers.push({
      id: spec.id,
      model: spec.model,
      maxOutputTokens: config.maxOutputTokens,
      reasoningEffort: spec.reasoningEffort,
      jsonMode: spec.jsonMode,
      transport: createHttpTransport({ baseUrl: spec.baseUrl, apiKey }),
    });
  }

  return { providers, skipped };
}
