import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildRows } from '../domain/rows';
import { applyFilters, defaultFilterState } from '../domain/filters';
import { messages } from '../domain/i18n';

// The site's own feed. Each entry links to the ORIGINAL article, not to a page
// here: this product is a pointer, not a republisher. The description carries
// the same text the site shows, with the machine-summary label kept inline so
// the disclosure survives into readers that only ever see the feed.

const MAX_ITEMS = 60;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async () => {
  const [storyEntries, sourceEntries] = await Promise.all([
    getCollection('stories'),
    getCollection('sources'),
  ]);

  const rows = applyFilters(
    buildRows(
      storyEntries.map((entry) => entry.data),
      sourceEntries.map((entry) => entry.data),
    ),
    defaultFilterState,
  ).slice(0, MAX_ITEMS);

  // The site origin plus the deployment sub-path. Story links point at the
  // original article, so only the channel's own links need this.
  const base =
    (import.meta.env.SITE ?? '').replace(/\/$/, '') +
    import.meta.env.BASE_URL.replace(/\/$/, '');
  const title = messages.siteTitle['zh-tw'];
  const description = messages.siteTagline['zh-tw'];
  const machineBadge = messages.storyMachineSummaryBadge['zh-tw'];

  const items = rows
    .map((row) => {
      const { story } = row;
      const headline = story.titleZhTW ?? story.title;
      const summary =
        story.summarySource === 'machine' && story.summaryZhTW !== null
          ? `[${machineBadge}] ${story.summaryZhTW}`
          : story.summaryOriginal;
      const body = [summary, `— ${row.sourceName}`, story.title]
        .filter((part) => part.length > 0)
        .join('\n\n');

      return [
        '    <item>',
        `      <title>${escapeXml(headline)}</title>`,
        `      <link>${escapeXml(story.url)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(story.id)}</guid>`,
        `      <pubDate>${new Date(story.publishedAt).toUTCString()}</pubDate>`,
        `      <source url="${escapeXml(base)}/rss.xml">${escapeXml(row.sourceName)}</source>`,
        `      <description>${escapeXml(body)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(base)}/</link>
    <description>${escapeXml(description)}</description>
    <language>zh-TW</language>
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
