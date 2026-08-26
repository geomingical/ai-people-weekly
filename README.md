# AI 教育週報 · AI in Education Weekly

A bilingual static site that collects news about AI in education from a
hand-picked list of feeds, files each story under its ISO week, and publishes a
weekly issue with a machine-written Traditional Chinese summary beside every
original headline and link.

**Live: https://geomingical.github.io/ai-education-weekly/**

Start with **[`docs/HANDOFF.md`](docs/HANDOFF.md)**.

## Commands

```bash
npm run dev              # local dev server
npm run build            # type-check and build to dist/
npm run verify           # unit tests + production build + browser suite

npm run pipeline:dry            # collect a week, write nothing
npm run pipeline:run            # collect a week and update src/data/stories.json
npm run pipeline:resummarize    # fill in Chinese summaries on stories that lack them
npx tsx pipeline/src/run.ts --since 45              # backfill the archive
npx tsx pipeline/src/resummarize.ts --dry-run --limit 6   # try the model on six, write nothing
```

Chinese summaries need `NVIDIA_API_KEY` (or `AI_EDU_API_KEY`) in `.env`. Without
a key the pipeline still runs and every story publishes with its source's own
summary — `pipeline:resummarize` fills them in later.

## Layout

```
src/domain/     pure logic — schemas, filters, ISO weeks, i18n. No framework.
src/data/       sources.json (the editorial control) and stories.json (the output)
src/components/ Astro components; each owns its own scoped styles
src/pages/      routes, mirrored under /en/, plus rss.xml and sitemap.xml
pipeline/       fetch feed → parse → gate → get article text → summarize → merge
tests/          unit, guard, and browser suites
docs/           handoff, and the source research this registry came from
```

## Status

**Live at https://geomingical.github.io/ai-education-weekly/** and running every
Monday at 09:00 Taipei time. 749 unit tests and 42 browser tests green.
