import { describe, expect, it } from 'vitest';
import { FETCH_LIMITS, isBlockedIp, safeFetch, type FetchIO } from '../src/fetcher';

// The fetcher is the single point where this pipeline reaches the network.
// These cover the SSRF guard, not every HTTP nicety.

function makeIo(overrides: Partial<FetchIO> = {}): FetchIO {
  return {
    fetch: async () => new Response('ok', { status: 200 }),
    resolve: async () => ['93.184.216.34'],
    now: () => new Date('2026-08-18T00:00:00Z'),
    ...overrides,
  };
}

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1', '2002:0a00:0001::',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  // Fail closed: anything unparseable is treated as blocked.
  it.each(['', '  ', 'not-an-ip', '1.2.3', '999.1.1.1'])('blocks unparseable %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
});

describe('safeFetch', () => {
  it('fetches an allowlisted https URL', async () => {
    const result = await safeFetch('https://example.org/feed', ['example.org'], makeIo());
    expect(result.status).toBe(200);
    expect(result.body).toBe('ok');
    expect(result.error).toBeNull();
  });

  it('allows a subdomain of an allowlisted domain', async () => {
    const result = await safeFetch('https://news.example.org/feed', ['example.org'], makeIo());
    expect(result.error).toBeNull();
  });

  it.each([
    ['a non-allowlisted host', 'https://evil.test/feed'],
    ['an http URL', 'http://example.org/feed'],
    ['an unparseable URL', 'not a url'],
  ])('blocks %s', async (_label, url) => {
    const result = await safeFetch(url, ['example.org'], makeIo());
    expect(result.error).toBe('blocked');
    expect(result.body).toBeNull();
  });

  // Defeats DNS rebinding that mixes one public and one private answer.
  it('blocks when ANY resolved address is private', async () => {
    const io = makeIo({ resolve: async () => ['93.184.216.34', '127.0.0.1'] });
    expect((await safeFetch('https://example.org/feed', ['example.org'], io)).error).toBe('blocked');
  });

  it('blocks when the host resolves to nothing', async () => {
    const io = makeIo({ resolve: async () => [] });
    expect((await safeFetch('https://example.org/feed', ['example.org'], io)).error).toBe('blocked');
  });

  // Every hop is re-validated, so a redirect cannot walk off the allowlist.
  it('blocks a redirect that leaves the allowlisted domains', async () => {
    const io = makeIo({
      fetch: async (input) => {
        const url = String(input);
        if (url.includes('evil.test')) return new Response('pwned', { status: 200 });
        return new Response(null, { status: 302, headers: { location: 'https://evil.test/x' } });
      },
    });
    const result = await safeFetch('https://example.org/feed', ['example.org'], io);
    expect(result.error).toBe('blocked');
    expect(result.body).toBeNull();
  });

  it('follows a redirect that stays inside the allowlist', async () => {
    let hop = 0;
    const io = makeIo({
      fetch: async () => {
        hop += 1;
        if (hop === 1) {
          return new Response(null, {
            status: 301,
            headers: { location: 'https://example.org/final' },
          });
        }
        return new Response('final body', { status: 200 });
      },
    });
    const result = await safeFetch('https://example.org/feed', ['example.org'], io);
    expect(result.body).toBe('final body');
    expect(result.redirectChain).toHaveLength(2);
  });

  it('stops after the redirect hop limit', async () => {
    const io = makeIo({
      fetch: async () =>
        new Response(null, { status: 302, headers: { location: 'https://example.org/next' } }),
    });
    const result = await safeFetch('https://example.org/feed', ['example.org'], io);
    expect(result.error).toBe('blocked');
    expect(result.redirectChain.length).toBe(FETCH_LIMITS.maxRedirects + 2);
  });

  // A non-2xx is a fact to report, not a crash: the caller must be able to tell
  // a 404 from a network failure.
  it('reports a 404 with no body and no error', async () => {
    const io = makeIo({ fetch: async () => new Response('nope', { status: 404 }) });
    const result = await safeFetch('https://example.org/feed', ['example.org'], io);
    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
    expect(result.error).toBeNull();
  });

  it('rejects a body that declares itself over the size cap', async () => {
    const io = makeIo({
      fetch: async () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(FETCH_LIMITS.maxBytes + 1) },
        }),
    });
    expect((await safeFetch('https://example.org/f', ['example.org'], io)).error).toBe('too-large');
  });

  // safeFetch must never throw: every outcome is a returned FetchResult.
  it('returns a network error instead of throwing when the socket fails', async () => {
    const io = makeIo({
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect((await safeFetch('https://example.org/f', ['example.org'], io)).error).toBe('network');
  });

  it('returns a network error when DNS resolution fails', async () => {
    const io = makeIo({
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect((await safeFetch('https://example.org/f', ['example.org'], io)).error).toBe('network');
  });
});
