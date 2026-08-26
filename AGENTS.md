# AGENTS.md

## Communicating With the User

The user is new to coding (vibe-coding beginner) — not a software engineer. This
overrides normal terse/technical defaults:

- Explain in plain language, not jargon. If a technical term is unavoidable, define
  it in one short clause the first time it's used in a conversation.
- Never assume familiarity with git, APIs, frameworks, or dev tooling concepts.
- When a decision needs the user's input, spell out explicitly: (a) what the
  choices are, (b) what each choice means in plain terms, (c) how each choice
  affects them concretely (cost, risk, what breaks, what they'll notice later).
  Don't just present options — say what picking each one actually does to their
  project.
- Prefer a short status-style summary over a technical diff/log dump when
  reporting what changed or what state things are in.
- 用繁體中文輸出，白話告訴我每個變動對專案可能展生什麼影響

## Research Collaboration Principles

- Data first, narrative second. Do not decide the paper or product story before evidence constrains interpretation.
- Think from the whole pipeline and uncertainty structure before proposing next steps.
- Frame progress around falsifiable questions, decision points, and evidence gaps.
- Treat methods as tools, not conclusions.
- Separate direct observations, model outputs, inference, and speculation.
- Prioritize uncertainty reduction.
- Mark exploratory findings explicitly.
- Preserve negative, null, and ambiguous outcomes.
- Treat human labels as useful anchors, not perfect truth unless independently validated.
- Run repeats before comparing variants. On this pipeline, run-to-run spread on a fixed setting exceeded most between-variant effects, so single-sample comparisons cannot resolve the differences being claimed.
- Write the success criteria down before looking at the output.
- Validate a new metric against samples whose direction is already known before trusting it to rank anything.

## 1. Think Before Coding

- Do not assume. Do not hide confusion. Surface tradeoffs.
- Before implementing, state assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of silently choosing.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

## 2. Simplicity First

- Write the minimum code that solves the problem.
- Do not add features beyond what was asked.
- Do not add abstractions for single-use code.
- Do not add flexibility or configurability that was not requested.
- Do not add error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- Ask whether a senior engineer would call the solution overcomplicated. If yes, simplify.

## 3. Surgical Changes

- Touch only what is required. Clean up only your own mess.
- Do not improve adjacent code, comments, or formatting while editing existing code.
- Do not refactor unrelated code.
- Match existing style, even if you would choose a different style.
- If unrelated dead code is noticed, mention it instead of deleting it.
- Remove imports, variables, functions, and files made unused by your own changes.
- Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

- Define success criteria and loop until verified.
- Transform tasks into verifiable goals:
  - Add validation -> write tests for invalid inputs, then make them pass.
  - Fix a bug -> write a test that reproduces it, then make it pass.
  - Refactor a module -> ensure tests pass before and after.
- For multi-step tasks, state a brief plan with verification for each step.
- Prefer strong success criteria over vague goals such as "make it work."

## MVP-Specific Rules

- Keep the MVP local and single-user unless the spec changes.
- Keep `GEMINI_API_KEY` backend-only and out of browser code.
- Treat Gemini labels as `model_suggested`, not confirmed geology.
- Do not claim automatic geological correctness in UI copy, docs, tests, or commit messages.
- Preserve the distinction between original photo observation, generated linework, and user-confirmed interpretation.

## 如果有閱讀完畢，請輸出「卡哇邦嘎」
