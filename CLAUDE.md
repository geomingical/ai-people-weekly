# Claude project instructions — AI 教育週報

## Read before coding

1. `docs/HANDOFF.md` — what this is, how a week runs, what is deliberately not built.
2. `docs/research/SOURCE_CANDIDATES.md` — the verified source research this registry came from.
3. `src/data/sources.json` — the editorial control surface. Read it before changing behaviour.

## The one thing that makes this project different

**This site publishes automatically. Nobody reads an item before it goes live.**

Ming chose that deliberately (2026-08-18): the editorial control is the source
list, not per-item review, because this is a personal reading tool and he checks
anything he acts on. Every design decision follows from that:

- The source registry is the only gate. Nothing outside `src/data/sources.json`
  can ever appear on the site.
- The ingest gate in `pipeline/src/ingest.ts` is strict on purpose. Anything it
  rejects, a reader never sees; anything it accepts goes live unread.
- Chinese headlines and summaries are machine-written. The **original headline,
  the source name, and the link always stay visible next to them**, so a wrong
  summary can be checked in one click. Never remove that.
- Every machine-written line carries a visible badge. Do not remove the badge,
  do not make it subtler, and do not present a machine summary as if it were the
  source's own words.
- Feed content is untrusted input to a language model. The injection defences in
  `pipeline/src/summarize/summarizer.ts` are load-bearing, not decoration.

## Priority when instructions conflict

1. Ming's current request.
2. This file's safety rules and human checkpoints.
3. `docs/HANDOFF.md`.
4. Existing code conventions.

Do not silently choose between conflicting instructions. Explain the conflict,
what each option changes for the project, and your recommendation, in plain
language.

## Think before coding

- State assumptions that affect the solution. Do not present guesses as facts.
- If a smaller solution meets the same need, recommend it.
- Name uncertainty and missing evidence. Ask before coding when a wrong
  assumption would materially change the result.
- Push back once when a request adds avoidable risk. If Ming reaffirms, do it.

## Simplicity first

- Write the minimum code the requested outcome needs.
- No features, abstractions, or configuration the current task does not require.
- Prefer existing project patterns and dependencies.

## Make surgical changes

- Every changed line traces back to the current request or its verification.
- Do not refactor, reformat, or rename adjacent code unless the task requires it.
- Mention unrelated problems you notice; do not fix them without approval.

## Work toward verifiable goals

- Define the observable result and the check that proves it, before implementing.
- Test-driven for behaviour changes: a failing test first, then make it pass.
- Run `npm run verify` before claiming a task is complete.
- Never say something is fixed, complete, or passing without fresh evidence. If a
  check could not run, say what was not verified.

## Communicating with Ming

Lead with the outcome and its project impact, not tool names. Use plain language;
explain a technical term the first time in half a sentence. Distinguish clearly
between a local file change, a local commit, a GitHub push, and a live deploy —
never imply one means another happened.

## Non-negotiable boundaries

- Do not read, print, copy, or commit `.env` or any API key. `.env` holds
  `NVIDIA_API_KEY` and is gitignored. Load it with `set -a; . ./.env; set +a`
  when running the pipeline; never echo it, never paste it into a file, never
  put it in a run report or a commit.
- Do not remove the machine-summary badge or the original-headline line.
- **Do not let article text reach the web.** The pipeline reads whole articles
  to summarize them, but that text is transient: it is never written to
  `src/data/stories.json` and never rendered. The site publishes a short excerpt
  (capped in `truncateSummary`), a machine summary, and the original link —
  nothing more. `tests/unit/guards.test.ts` enforces this mechanically. Several
  sources in the registry state "summary and link only"; this is a licence
  commitment, not a style preference.
- Do not fetch an article page when the feed already carried the body in
  `content:encoded`. Asking a publisher's server for something it already handed
  over in its own feed is rude and pointless.
- Do not add a source without verifying its feed actually returns a feed, and
  without recording `licenseNote` and `lastVerified`.
- Do not activate a source whose `robots.txt` forbids fetching its feed. The
  registry already contains two such entries, kept inactive on purpose
  (`gov-uk-dfe-ai`, `computers-education-ai`). Do not "fix" them by activating.
- Do not widen `officialDomains` to a shared platform host (`substack.com`,
  `medium.com`, `github.io`). That turns the SSRF allowlist into an allow-all
  for every account on that platform.
- Do not uncomment a `schedule:`, `push:`, or `pull_request:` trigger in
  `.github/workflows/`. `tests/unit/guards.test.ts` enforces this mechanically.
- Do not add advertising, affiliate links, ranking, scoring, reader accounts, or
  analytics.

## Human checkpoints — ask Ming first

- Pushing to GitHub, enabling GitHub Pages, changing DNS, or deploying.
- Enabling the weekly schedule (this starts automatic public publishing).
- Creating or editing any secret, including the model API key.
- Adding or removing a source, or flipping one active/inactive.
- Changing the story or source schema.
- Adding a paid service or a new dependency.

## Working method

- Stage explicit paths. Never `git add .` or `git add -A`.
- `npm run verify` = unit tests + production build + browser suite. Run it all.
- Preserve failed, empty, rejected, and outside-window cases in the run report
  rather than forcing a positive-looking result.
