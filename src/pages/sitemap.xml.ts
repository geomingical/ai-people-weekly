import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildRows, issueLabels } from '../domain/rows';

// Static routes plus one entry per issue in each locale. Derived from the
// same data the pages are built from, so a new issue cannot be missed.
const STATIC_ROUTES = [
  '/',
  '/archive/',
  '/sources/',
  '/method/',
  '/en/',
  '/en/archive/',
  '/en/sources/',
  '/en/method/',
];

export const GET: APIRoute = async () => {
  const [storyEntries, sourceEntries] = await Promise.all([
    getCollection('stories'),
    getCollection('sources'),
  ]);
  const labels = issueLabels(
    buildRows(
      storyEntries.map((entry) => entry.data),
      sourceEntries.map((entry) => entry.data),
    ),
  );

  const issueRoutes = labels.flatMap((label) => [
    `/weekly/${label}/`,
    `/en/weekly/${label}/`,
  ]);

  const base =
    (import.meta.env.SITE ?? '').replace(/\/$/, '') +
    import.meta.env.BASE_URL.replace(/\/$/, '');
  const urls = [...STATIC_ROUTES, ...issueRoutes]
    .map((route) => `  <url><loc>${base}${route}</loc></url>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
