# AI 與人週報 · AI and People Weekly

[瀏覽靜態網站 · View the live site](https://geomingical.github.io/ai-people-weekly/)

A bilingual static site that collects research on what AI does to the people
who use it — sycophancy, dependence, companionship, trust, wellbeing,
cognition, social behaviour — from a hand-picked list of journals, preprint
servers and survey organisations, files each study under its ISO week, and
publishes a weekly issue with a machine-written Traditional Chinese summary
beside every original title and link.

**Only studies where a real person was measured.** A paper about making a model
less sycophantic does not qualify; a paper measuring how sycophancy changes what
people do, does. The test is what was measured, not whose data was used.

## Commands

```bash
npm run dev              # local dev server
npm run build            # type-check and build to dist/
npm run verify           # unit tests + production build + browser suite

npm run pipeline:dry            # collect a week, write nothing
npm run pipeline:run            # collect a week and update src/data/stories.json
npm run pipeline:resummarize    # fill in Chinese summaries on stories that lack them
npx tsx pipeline/src/run.ts --since 45              # backfill the archive
```

Chinese summaries need `NVIDIA_API_KEY` and, as a fallback, `GROQ_API_KEY` in
`.env` — see `.env.example`. Without a key the gate publishes nothing at all,
which is deliberate: relevance here means "was a person measured", and no
keyword rule can answer that, so an outage must not publish unvetted work.

## Layout

```
src/domain/     pure logic — schemas, filters, ISO weeks, i18n. No framework.
src/data/       sources.json (the editorial control) and stories.json (the output)
src/components/ Astro components; each owns its own scoped styles
src/pages/      routes, mirrored under /en/, plus rss.xml and sitemap.xml
pipeline/       fetch feed → parse → date → abstract → gate → summarize → merge
tests/          unit, guard, and browser suites
docs/           the design spec and the implementation plan this was built from
```

## Where abstracts come from

Seventeen of the twenty-eight journals ship feeds with no abstract — Taylor &
Francis sends 52 characters of volume and page numbers. Since the gate has to
read an abstract, `pipeline/src/enrich.ts` tries three rungs in order: what the
feed carried, then OpenAlex, then the publisher's own article page where its
robots.txt permits that. ScienceDirect never gets the third rung; it returns 403
on robots.txt and asserts a text-and-data-mining reservation.

## Status

Deployed to [GitHub Pages](https://geomingical.github.io/ai-people-weekly/).
The weekly collection runs every Monday at 10:30 Asia/Taipei time.
