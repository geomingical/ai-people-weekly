import { z } from 'astro/zod';
import { TOPICS } from './story';

// The source registry is the product's spine. Ming's publishing decision is
// "control the sources, then publish automatically" — which means this file
// IS the editorial control. Nothing enters the site that did not come from a
// source listed here, and `officialDomains` doubles as the pipeline's SSRF
// allowlist (see pipeline/src/fetcher.ts).

export const SOURCE_CATEGORIES = [
  'vendor-education', // OpenAI / Google / Anthropic / Microsoft education programmes
  'policy',           // UNESCO, OECD, EU, national ministries
  'research',         // arXiv, journals, university labs
  'edtech-news',      // EdSurge, EdWeek, Inside Higher Ed, THE
  'practitioner',     // teacher blogs and practitioner communities
  'taiwan-local',     // Taiwanese / Chinese-language sources
] as const;

export const FEED_FORMATS = ['rss', 'atom', 'json', 'sitemap', 'none'] as const;

// A label is 1-63 chars of [a-z0-9-], not starting or ending with '-'.
const DOMAIN_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

// A bare public suffix in officialDomains would turn the SSRF allowlist into
// an allow-all for that suffix, silently. Reject the ones this registry could
// plausibly hit. Extend when a source under a new suffix is added.
const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  'com', 'net', 'org', 'io', 'ai', 'co', 'dev', 'app', 'edu', 'gov', 'int',
  'cloud', 'tech', 'xyz', 'me', 'news', 'cn', 'tw', 'jp', 'uk', 'de', 'fr',
  'eu', 'us', 'ca', 'au', 'in', 'info', 'biz', 'ac.uk', 'co.uk', 'org.uk',
  'gov.uk', 'com.tw', 'edu.tw', 'gov.tw', 'org.tw', 'com.cn', 'edu.cn',
  'ac.jp', 'co.jp', 'com.au', 'edu.au', 'co.in',
]);

function isIPv4Literal(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

// Fails closed: anything not affirmatively a normalized, multi-label domain
// name is rejected.
export function isValidOfficialDomain(value: string): boolean {
  if (value.length === 0) return false;
  if (/\s/.test(value)) return false;
  if (value !== value.toLowerCase()) return false;
  if (/[:/@?#]/.test(value)) return false;
  if (value.includes('://')) return false;
  if (isIPv4Literal(value)) return false;

  const labels = value.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => DOMAIN_LABEL_RE.test(label))) return false;
  if (PUBLIC_SUFFIXES.has(value)) return false;

  return true;
}

const officialDomainSchema = z.string().refine(isValidOfficialDomain, {
  message:
    'officialDomains entries must be a lowercase, multi-label domain with no scheme, port, credentials, path, query, or whitespace, must not be an IP literal, and must not be a bare public suffix',
});

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message: 'source URLs must use https',
  });

export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    homepage: httpsUrl,

    // null means "no machine-readable index exists at all". Such a source stays
    // in the registry as a human reading list but is never fetched.
    //
    // `sitemap` is for publishers with no feed but a standards-compliant
    // sitemap.xml carrying <lastmod> dates. It is the honest fallback: a
    // published standard with a published date field, rather than a CSS
    // selector that breaks on the next redesign.
    feedUrl: httpsUrl.nullable(),
    feedFormat: z.enum(FEED_FORMATS),

    // Sitemap sources only: the URL substring that marks an article rather than
    // a marketing page — e.g. "/news/". A sitemap lists the whole site, so
    // without this the pipeline would try to read the pricing page.
    urlPattern: z.string().min(1).nullable().default(null),

    category: z.enum(SOURCE_CATEGORIES),
    language: z.enum(['en', 'zh-tw', 'zh-cn', 'other']),
    region: z.string().min(2),

    // SSRF allowlist for this source: the feed URL and every redirect hop must
    // land on one of these hosts or a subdomain of one.
    officialDomains: z.array(officialDomainSchema).min(1),

    // Ming's trust ordering. `first-party` means the organisation is writing
    // about itself (a ministry announcing its own policy, a vendor announcing
    // its own programme) — the highest-value signal for this product.
    tier: z.enum(['first-party', 'institution', 'media', 'research', 'community']),

    // How much of this feed is on-topic. `always` means the whole feed is about
    // AI in education (a ministry's AI-in-schools feed, an edtech outlet), so
    // every item is kept. `keyword` means the feed is general-purpose (a
    // vendor's main blog, arXiv cs.CY) and each item must show education
    // signal before it is published — without this, a general vendor blog
    // would flood the issue with unrelated product news.
    relevanceMode: z.enum(['always', 'keyword']),

    // Topics applied to every story from this source when the classifier finds
    // nothing more specific. Keeps a policy feed's stories from landing
    // untagged; the schema requires at least one topic per story.
    defaultTopics: z.array(z.enum(TOPICS)).min(1),

    // Hard cap on how many items this source may contribute to one run.
    // Without it a high-volume feed silently becomes the whole issue: the
    // first real run pulled 28 of 31 stories from three arXiv feeds, which is
    // a paper dump, not a weekly read. Newest items win the cap.
    maxPerRun: z.number().int().positive().max(50),

    active: z.boolean(),

    // Copyright / reuse note recorded at registration time. This product
    // republishes the source's own summary and links out; it never mirrors
    // full article bodies. A source whose terms forbid even that belongs
    // here with active: false and the reason in `notes`.
    licenseNote: z.string(),
    lastVerified: z.string().date(),
    notes: z.string(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.feedFormat === 'sitemap' && source.urlPattern === null) {
      ctx.addIssue({
        code: 'custom',
        message: `sitemap source "${source.id}" must set urlPattern, or it would try to read every page on the site`,
        path: ['urlPattern'],
      });
    }
    if (source.feedFormat !== 'sitemap' && source.urlPattern !== null) {
      ctx.addIssue({
        code: 'custom',
        message: `urlPattern only applies to sitemap sources; source "${source.id}" is ${source.feedFormat}`,
        path: ['urlPattern'],
      });
    }
    if (source.feedUrl === null && source.feedFormat !== 'none') {
      ctx.addIssue({
        code: 'custom',
        message: `source "${source.id}" has no feedUrl, so feedFormat must be "none"`,
        path: ['feedFormat'],
      });
    }
    if (source.feedUrl !== null && source.feedFormat === 'none') {
      ctx.addIssue({
        code: 'custom',
        message: `source "${source.id}" has a feedUrl, so feedFormat must not be "none"`,
        path: ['feedFormat'],
      });
    }
    if (source.active && source.feedUrl === null) {
      ctx.addIssue({
        code: 'custom',
        message: `source "${source.id}" is active but has no feed to fetch; set active: false to keep it as a reading-list entry`,
        path: ['active'],
      });
    }

    const allowed = source.officialDomains.map((domain) => domain.toLowerCase());
    const checkHost = (rawUrl: string, path: (string | number)[]) => {
      let hostname: string;
      try {
        hostname = new URL(rawUrl).hostname.toLowerCase();
      } catch {
        return; // z.string().url() already reported an unparseable URL
      }
      const ok = allowed.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );
      if (!ok) {
        ctx.addIssue({
          code: 'custom',
          message: `host "${hostname}" is not covered by officialDomains for source "${source.id}"`,
          path,
        });
      }
    };

    checkHost(source.homepage, ['homepage']);
    if (source.feedUrl !== null) checkHost(source.feedUrl, ['feedUrl']);
  });

export type Source = z.infer<typeof sourceSchema>;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

const sourceArraySchema = z.array(sourceSchema);

/** Parses the registry and rejects duplicate ids across the array. */
export function loadSources(json: unknown): Source[] {
  const sources = sourceArraySchema.parse(json);
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) {
      throw new Error(`duplicate source id "${source.id}" in source registry`);
    }
    seen.add(source.id);
  }
  return sources;
}
