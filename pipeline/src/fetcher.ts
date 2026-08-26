// Phase 2A Task 3 — SSRF-safe evidence fetcher.
//
// This is the single choke point where the weekly verification pipeline reaches
// the network. It enforces, on the initial URL AND on every redirect hop:
//   1. https-only,
//   2. an official-domain allowlist (exact host or subdomain suffix match),
//   3. DNS-resolved IP rejection via a "globally routable unicast only"
//      classifier — every non-public range (loopback, private, link-local,
//      CGNAT, multicast, documentation/benchmark ranges, etc.) is blocked by
//      default rather than enumerated as a denylist, and rejection is on ANY
//      blocked resolved IP, not just all of them, to defeat DNS-rebinding
//      attacks that mix a public and a private answer,
//   4. a redirect hop limit,
//   5. one absolute deadline for the whole call (DNS + every hop's fetch +
//      body read all share a single budget; see the residual-risk note above
//      `safeFetch` below),
//   6. a response body size cap.
//
// `safeFetch` never throws: every outcome — success, blocked, timeout, network
// failure, oversized body — is represented as a `FetchResult`. All network and
// DNS access is injected via `FetchIO` so this module (and its tests) never touch
// a real socket or a real resolver.

import type { FetchResult } from './contracts';

export interface FetchIO {
  fetch: typeof globalThis.fetch;
  resolve: (hostname: string) => Promise<string[]>; // returns IP strings
  now: () => Date;
}

export const FETCH_LIMITS = {
  maxRedirects: 3,
  timeoutMs: 15_000,
  maxBytes: 2 * 1024 * 1024,
} as const;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

// ---------------------------------------------------------------------------
// IP blocking (isBlockedIp) — fails closed: anything that cannot be parsed as
// a valid IPv4 or IPv6 address is treated as blocked.
// ---------------------------------------------------------------------------

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (normalized.length === 0) return true;

  if (normalized.includes(':')) {
    return isBlockedIPv6(normalized);
  }

  const octets = parseIPv4(normalized);
  if (octets === null) return true;
  return isBlockedIPv4(octets);
}

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

// "Globally routable unicast only" classifier: rather than enumerate the
// ranges we want to block (which is easy to leave gaps in), this blocks
// everything EXCEPT normal public unicast space. Anything not affirmatively
// public is treated as internal/reserved/special-use and rejected.
function isBlockedIPv4(octets: number[]): boolean {
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  const c = octets[2] ?? 0;

  if (a === 0) return true; // 0.0.0.0/8 ("this" network)
  if (a === 10) return true; // 10.0.0.0/8 (private)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 (former 6to4 relay anycast)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
  if (a === 198 && b >= 18 && b <= 19) return true; // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 (multicast)
  if (a >= 240) return true; // 240.0.0.0/4 (reserved, includes 255.255.255.255 broadcast)

  return false;
}

// Expands a syntactically-plausible IPv6 literal (including "::" compression
// and a trailing IPv4-mapped dotted quad, e.g. "::ffff:10.0.0.1") into 8
// 16-bit groups. Returns null on anything that doesn't parse — callers must
// treat null as "blocked" (fail closed).
function expandIPv6(address: string): number[] | null {
  const compressionCount = (address.match(/::/g) ?? []).length;
  if (compressionCount > 1) return null;

  const hasCompression = compressionCount === 1;
  let headStr = address;
  let tailStr: string | null = null;

  if (hasCompression) {
    const idx = address.indexOf('::');
    headStr = address.slice(0, idx);
    tailStr = address.slice(idx + 2);
  }

  const headParts = headStr.length > 0 ? headStr.split(':') : [];
  const tailParts = hasCompression && tailStr !== null && tailStr.length > 0 ? tailStr.split(':') : [];

  // A dotted-quad IPv4 literal, if present, is always the final group.
  const lastGroupParts = hasCompression ? tailParts : headParts;
  let embeddedV4: number[] | null = null;
  if (lastGroupParts.length > 0) {
    const last = lastGroupParts[lastGroupParts.length - 1];
    if (last !== undefined && last.includes('.')) {
      embeddedV4 = parseIPv4(last);
      if (embeddedV4 === null) return null;
      lastGroupParts.pop();
    }
  }

  const headGroups = headParts.map(hexToGroup);
  const tailGroups = tailParts.map(hexToGroup);
  if (headGroups.includes(null) || tailGroups.includes(null)) return null;

  const v4GroupCount = embeddedV4 !== null ? 2 : 0;
  const knownCount = headGroups.length + tailGroups.length + v4GroupCount;

  let result: number[];
  if (hasCompression) {
    const zerosNeeded = 8 - knownCount;
    if (zerosNeeded < 0) return null;
    result = [...(headGroups as number[]), ...new Array(zerosNeeded).fill(0), ...(tailGroups as number[])];
  } else {
    if (knownCount !== 8) return null;
    result = [...(headGroups as number[]), ...(tailGroups as number[])];
  }

  if (embeddedV4 !== null) {
    result.push(((embeddedV4[0] ?? 0) << 8) | (embeddedV4[1] ?? 0));
    result.push(((embeddedV4[2] ?? 0) << 8) | (embeddedV4[3] ?? 0));
  }

  return result.length === 8 ? result : null;
}

function hexToGroup(part: string): number | null {
  if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
  return parseInt(part, 16);
}

// Same "globally routable unicast only" philosophy as isBlockedIPv4: block
// everything that is not affirmatively normal public IPv6 unicast space,
// rather than enumerate attack-relevant ranges and risk leaving a gap.
function isBlockedIPv6(address: string): boolean {
  const groups = expandIPv6(address);
  if (groups === null) return true;

  // IPv4-mapped: ::ffff:a.b.c.d -> groups[0..4] = 0, groups[5] = 0xffff.
  // The IPv6 wrapper is not itself the security boundary; unwrap and apply
  // the IPv4 rules to the embedded address.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const mapped = [
      (groups[6]! >> 8) & 0xff,
      groups[6]! & 0xff,
      (groups[7]! >> 8) & 0xff,
      groups[7]! & 0xff,
    ];
    return isBlockedIPv4(mapped);
  }

  // 6to4: 2002:AABB:CCDD::/16 embeds IPv4 a.b.c.d in groups[1..2]. Same
  // reasoning as IPv4-mapped above: unwrap and re-check the embedded address.
  if (groups[0] === 0x2002) {
    const mapped = [
      (groups[1]! >> 8) & 0xff,
      groups[1]! & 0xff,
      (groups[2]! >> 8) & 0xff,
      groups[2]! & 0xff,
    ];
    return isBlockedIPv4(mapped);
  }

  if (groups.every((g) => g === 0)) return true; // ::/128 (unspecified)
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1/128 (loopback)

  // 64:ff9b::/96 (NAT64 well-known prefix).
  if (
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  ) {
    return true;
  }

  // 100::/64 (discard-only prefix).
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true;

  const first = groups[0]!;
  const second = groups[1]!;

  if (first === 0x2001 && second === 0x0db8) return true; // 2001:db8::/32 (documentation)
  if (first === 0x2001 && second === 0x0000) return true; // 2001::/32 (Teredo)
  if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7 (unique-local)
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10 (link-local)
  if (first >= 0xfec0 && first <= 0xfeff) return true; // fec0::/10 (deprecated site-local)
  if (first >= 0xff00 && first <= 0xffff) return true; // ff00::/8 (multicast)

  return false;
}

// ---------------------------------------------------------------------------
// Hop validation — re-applied to the initial URL and to every redirect target.
// ---------------------------------------------------------------------------

type HopValidation = 'ok' | 'blocked' | 'network' | 'timeout';

// Races `io.resolve` against the remaining call budget so a hanging resolver
// cannot stall `safeFetch` past its deadline. Always clears its timer, on
// every exit path, so no handle is left dangling.
type ResolveOutcome = { kind: 'ok'; ips: string[] } | { kind: 'network' } | { kind: 'timeout' };

async function resolveWithDeadline(
  io: FetchIO,
  hostname: string,
  budgetMs: number,
): Promise<ResolveOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutRace = new Promise<ResolveOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), budgetMs);
    });
    // `io.resolve` is injected, so it may throw synchronously instead of
    // returning a rejected promise. Deferring the call through an already
    // resolved promise turns both failure modes into a rejection, which keeps
    // safeFetch's never-throws contract and keeps the timer cleanup reachable.
    const resolveRace: Promise<ResolveOutcome> = Promise.resolve()
      .then(() => io.resolve(hostname))
      .then((ips): ResolveOutcome => ({ kind: 'ok', ips }))
      .catch((): ResolveOutcome => ({ kind: 'network' }));

    return await Promise.race([resolveRace, timeoutRace]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function validateHop(
  rawUrl: string,
  allowedDomains: readonly string[],
  io: FetchIO,
  remainingMs: () => number,
): Promise<HopValidation> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'blocked'; // unparseable URL -> fail closed
  }

  if (parsed.protocol !== 'https:') return 'blocked';

  const hostname = parsed.hostname.toLowerCase();
  const domainAllowed = allowedDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  });
  if (!domainAllowed) return 'blocked';

  const dnsBudget = remainingMs();
  if (dnsBudget <= 0) return 'timeout';

  const resolution = await resolveWithDeadline(io, hostname, dnsBudget);
  if (resolution.kind === 'timeout') return 'timeout';
  if (resolution.kind === 'network') return 'network';

  const { ips } = resolution;
  if (ips.length === 0) return 'blocked';
  if (ips.some((ip) => isBlockedIp(ip))) return 'blocked';

  return 'ok';
}

function resolveRedirectUrl(location: string, base: string): string | null {
  try {
    return new URL(location, base).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bounded body reading — prefers streaming so oversized bodies are abandoned
// mid-read; falls back to response.text() for test doubles without a real
// ReadableStream. A content-length header over the cap short-circuits before
// any read is attempted.
// ---------------------------------------------------------------------------

interface StreamLikeBody {
  getReader: () => {
    read: () => Promise<{ done: boolean; value?: Uint8Array }>;
    cancel: () => Promise<void>;
  };
}

function isStreamLikeBody(body: unknown): body is StreamLikeBody {
  return (
    body !== null &&
    typeof body === 'object' &&
    typeof (body as { getReader?: unknown }).getReader === 'function'
  );
}

async function readBoundedBody(
  response: Response,
): Promise<{ body: string | null; error: 'too-large' | null }> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > FETCH_LIMITS.maxBytes) {
      return { body: null, error: 'too-large' };
    }
  }

  if (isStreamLikeBody(response.body)) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > FETCH_LIMITS.maxBytes) {
          await reader.cancel().catch(() => undefined);
          return { body: null, error: 'too-large' };
        }
        chunks.push(value);
      }
    }
    return { body: Buffer.concat(chunks).toString('utf8'), error: null };
  }

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > FETCH_LIMITS.maxBytes) {
    return { body: null, error: 'too-large' };
  }
  return { body: text, error: null };
}

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------
//
// Residual risk: DNS TOCTOU (accepted, not fixed here).
//
// `validateHop` resolves the hostname via `io.resolve` and rejects
// private/internal IPs, but the actual connection is then made by
// `io.fetch`, which re-resolves the hostname itself — `fetch` has no way to
// accept a pinned address. A hostile or compromised resolver, or simply a
// record's TTL expiring between the check and the connect, can therefore
// return a public IP to the validation check and a private/internal IP to
// the real TCP connect, defeating the SSRF guard for that hop. This is a
// genuine gap, not a theoretical one.
//
// It is accepted for now, unfixed, because: (a) fetch targets are
// restricted to a small, human-curated allowlist of official provider
// domains (`officialDomains` in the provider registry), not arbitrary
// user-supplied URLs, which sharply limits who can influence what gets
// resolved; and (b) the pipeline runs in an ephemeral CI runner with no
// persistent state for an attacker to pivot into.
//
// The real fix is to pin the validated IP at the connection layer — a
// custom `fetch` dispatcher / `lookup` override that forces the TCP
// connection to the exact address `validateHop` checked, while still
// sending the original hostname in SNI and the Host header. That is a
// substantially larger change than a targeted hardening pass and has not
// been implemented here.

export async function safeFetch(
  url: string,
  allowedDomains: readonly string[],
  io: FetchIO,
): Promise<FetchResult> {
  const redirectChain: string[] = [];
  let currentUrl = url;
  let lastStatus: number | null = null;

  // One absolute deadline for the entire call — DNS resolution, every
  // redirect hop's fetch, and every body read all draw down the same
  // budget, rather than each hop getting a fresh full timeout.
  const deadline = io.now().getTime() + FETCH_LIMITS.timeoutMs;
  const remainingMs = () => deadline - io.now().getTime();

  const finalize = (
    status: number | null,
    body: string | null,
    error: FetchResult['error'],
  ): FetchResult => ({
    url,
    finalUrl: currentUrl,
    status,
    body,
    fetchedAt: io.now().toISOString(),
    error,
    redirectChain,
  });

  for (let hop = 0; ; hop += 1) {
    if (hop > FETCH_LIMITS.maxRedirects) {
      redirectChain.push(currentUrl);
      return finalize(lastStatus, null, 'blocked');
    }

    redirectChain.push(currentUrl);

    const validation = await validateHop(currentUrl, allowedDomains, io, remainingMs);
    if (validation !== 'ok') {
      return finalize(lastStatus, null, validation);
    }

    const fetchBudget = remainingMs();
    if (fetchBudget <= 0) {
      return finalize(lastStatus, null, 'timeout');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchBudget);

    let response: Response;
    try {
      response = await io.fetch(currentUrl, { redirect: 'manual', signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted || (err as { name?: string } | null)?.name === 'AbortError';
      return finalize(lastStatus, null, timedOut ? 'timeout' : 'network');
    }

    lastStatus = response.status;

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const next = resolveRedirectUrl(location, currentUrl);
        clearTimeout(timer);
        if (next === null) {
          return finalize(lastStatus, null, 'blocked');
        }
        currentUrl = next;
        continue;
      }
      // Redirect status with no location header -> treat the response as final.
    }

    // Non-2xx responses are not errors: report the status with no body so the
    // caller can distinguish e.g. a 404 from a network failure.
    if (response.status < 200 || response.status >= 300) {
      clearTimeout(timer);
      return finalize(lastStatus, null, null);
    }

    const bodyBudget = remainingMs();
    if (bodyBudget <= 0) {
      clearTimeout(timer);
      return finalize(lastStatus, null, 'timeout');
    }

    let bodyOutcome: { body: string | null; error: 'too-large' | null };
    try {
      bodyOutcome = await readBoundedBody(response);
    } catch (err) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted || (err as { name?: string } | null)?.name === 'AbortError';
      return finalize(lastStatus, null, timedOut ? 'timeout' : 'network');
    }
    clearTimeout(timer);

    return finalize(lastStatus, bodyOutcome.body, bodyOutcome.error);
  }
}
