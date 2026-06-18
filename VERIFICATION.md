# VERIFICATION.md — Citation Firewall

**Independent re-grade · 2026-06-18 · Verifier sub-agent (fresh context, did not write the code)**

**Overall verdict: PASS — all R1–R10 pass; all done-gates green.** This re-grade focused on the copy-only softening of the FLAGGED verdict from "hallmark of AI fabrication / BLOCKED from synthesis" to honest "could not confirm" language. The new wording is consistent across the verifier note, UI legend/badge, Sutra synthesis rules, README, and RUBRIC; **no place still calls a flagged cite a proven fabrication.** No verification logic changed: the honest-label guarantee and PDF-paste resilience both hold under live testing — a shared defendant alone does not VERIFY (→ CITE_MISMATCH), a PDF-mangled landmark with jammed parallel cites VERIFIES, and a nameless subsequent-history fragment is UNVERIFIED (not a false mismatch). Both demo failure modes (FLAGGED + CITE_MISMATCH) fire live.

## R1–R10

| ID | Verdict | Evidence |
|----|---------|----------|
| **R1** | **PASS** | `GET /` → HTTP 200, 23.5 KB single HTML. Live demo run on :3100 completed in **56s** (and isolated `pnpm e2e` = 64.5s), terminal `done` event, **zero `error` events** (21 events: 8 stage / 7 citation / 3 agent / extracted / report / done). < 90s. |
| **R2** | **PASS** | Live: Vandermeer `742 F.4th 1188` → **FLAGGED** with honest note (below); 5 reals (Twombly/Iqbal/Conley/Qualitex/Two Pesos) → **VERIFIED** each with a working `…/opinion/…` CourtListener URL; Sunhaven `784 F.3d 412` → **CITE_MISMATCH** resolving to "Arie Friedman v. City of Highland Park". Honest-label guarantee upheld. |
| **R3** | **PASS** | `'VERIFIED'` literal exists only in `src/verifier.ts:123`; grep of `src/agents/*` + `src/anthropic.ts` for a quoted VERIFIED literal = **0 hits**. `test/r3-grep.test.ts` enforces this (2 tests pass). `src/pipeline.ts` only *reads* `e.status`, never assigns. VERIFIED requires a side-aware substantial name match (`nameMatches`, verifier.ts:121); Tinker paste-mangled still VERIFIES (below). |
| **R4** | **PASS** | Live HALT: POST `/halt` 3s into run → `{"halted":true}`; stream showed `extract:start → extracted → extract:done → halted` and **terminated — no council/verify/sutra stage events** after `halted`. `test/halt.test.ts` (4 tests) passes. |
| **R5** | **PASS** | `ANTHROPIC_API_KEY` read only at `src/anthropic.ts:16` (server-side). Served HTML: 0 matches for `sk-ant` / `ANTHROPIC_API_KEY` / `anthropic`. Static file cannot leak the key. |
| **R6** | **PASS** | All 3 Opposing Counsel attacks from the live run quote passages found **verbatim** in the demo brief text (programmatic substring check = True for all). Prompt mandates exact-quote-or-omit (`src/agents/opposingCounsel.ts:13`). |
| **R7** | **PASS** | Live Sutra report weakness severities = `[5,4,4,4,3,3,2]` (sorted desc). Top two weaknesses are reliance on the FLAGGED (sev 5) and CITE_MISMATCH (sev 4) authorities; nextSteps say to manually verify/remove them. `src/pipeline.ts:177` sorts desc and injects FLAGGED/CITE_MISMATCH/UNVERIFIED as high-severity weaknesses (5/4/3). |
| **R8** | **PASS** | README has problem, `## 60-second quickstart`, `## Architecture`, `## Built today vs. brought in`. `LICENSE` = MIT. `BRIEF.md`, `PLAN.md`, `RUBRIC.md`, `VERIFICATION.md` all committed (`git ls-files`). |
| **R9** | **PASS** | README quickstart: `git clone` → `pnpm install` → 2 documented env vars (`.env.example` lists both + optional PORT) → `pnpm start`. Single Hono process, no DB/bundler. Plausibly < 5 min from a clean clone. |
| **R10** | **PASS** | Tokens present in `public/index.html`; `--saffron: #e3a23c` used ONLY on `.sutra .eyebrow` / `.sutra h3` (Sutra synthesis). Legend uses the spec marks ✓ ◐ ≠ ⚠ ✕. |

## Done-gates

- **`pnpm test`: PASS — 44 tests, 6 files green** in 1.11s (r3-grep 2, verifier 9, citeParser 23, zod 4, buildReport 2, halt 4).
- **`pnpm e2e`: PASS — 1 test, 64.5s** when run in isolation (asserts R1 + R2 live). NOTE: an earlier e2e run failed with a **100s timeout** *only* because it overlapped my own concurrent live demo run — the app holds a single in-memory run at a time, so the two contended. Re-run alone, it passed cleanly at 64.5s. Not a code defect; see risks.
- **Live production run on :3100: PASS** — 56s end-to-end, terminal `done`, no `error`.
- **Live HALT: PASS** — `halted` event after the extract stage, no subsequent-stage events.

## Honest-label, copy & PDF-paste verification

**FLAGGED note observed live (Vandermeer, 742 F.4th 1188):**
> "No match found in CourtListener — verify manually. May be fabricated, or unpublished, very recent, or in a reporter/database CourtListener doesn't fully cover."

This is the honest wording. **Grep for "hallmark of AI fabrication" and "BLOCKED from synthesis" across `src/` and `public/` = 0 hits** (also 0 in README/RUBRIC/demo). The Sutra prompt (`src/agents/sutra.ts:25`) frames flagged/mismatch/unverified authorities as "could not confirm," not "proven fake," and explicitly instructs the model to "not assert a citation is fabricated." UI legend: "✕ flagged — not found, verify manually"; badge: "not found — verify". CITE_MISMATCH note: "…confirm this is the intended authority. Not verified; do not rely on it as cited." Copy is consistent across verifier note, UI, Sutra rules, README, and RUBRIC.

**PDF-paste / side-aware name-match spot check** (one `verifyAll` via `createCourtListenerClient`, scratch script run then deleted; repo left clean):

| Input | Result | Resolves to |
|-------|--------|-------------|
| `Tinker v. Des Moines, 393 U.S. 503, 89 S.Ct. 733, 21 L.Ed.2d 731 (1969)` (jammed parallel cites) | **VERIFIED** (393 U.S. 503) | Tinker v. Des Moines Independent Community School District |
| `Miller v. City of Wickliffe, 852 F.3d 497 (6th Cir. 2017)` | **CITE_MISMATCH** | "Julious Mosley v. City of Wickliffe" — shared defendant alone correctly insufficient to VERIFY |
| `(rev'd on other grounds, 412 U.S. 94 (1973))` | **UNVERIFIED** ("citation fragment — no case name to confirm") | not a false mismatch |

**Two demo failure modes, confirmed live:** Vandermeer (true no-match) → FLAGGED; Sunhaven 784 F.3d 412 → CITE_MISMATCH (resolves to Friedman v. City of Highland Park).

## Notes / risks

- **Single in-memory run (one at a time):** by design (BRIEF §3). Concrete consequence observed: a second concurrent run starved my parallel demo and the first `pnpm e2e` attempt timed out at 100s. Fine for a single-presenter demo, but two simultaneous users (or an overlapping test) will contend.
- **CourtListener 5/min throttle:** the verifier batches all cites in one `citation-lookup` `prime()` call to stay under it. A burst of separate `verifyAll` calls (or repeated re-grades) within a minute can return uniformly UNVERIFIED/"unreachable"; the code degrades to UNVERIFIED rather than emitting a false VERIFIED (safe), but a flaky network read could surface a real cite as UNVERIFIED.
- **Port-3000 conflict:** README quickstart defaults to PORT 3000; the deployed box runs on 3100 because 3000 is taken there. A fresh-clone evaluator on a machine with something on 3000 must set `PORT`.
- **No-separator-jam residual:** the Tinker fix relies on stripping parallel reporter cites; a cite with *no* delimiter at all between parties and reporter could still mis-parse. The fragment guard (`hasCaseName`) prevents the more dangerous failure (a stray fragment falsely matching a candidate's party name) — verified live with the 412 U.S. 94 fragment.
- **≤3-char-surname edge:** the side-aware name match relies on substantial party-name overlap; very short surnames (≤3 chars) are an inherent edge for any fuzzy name comparison and could in principle over- or under-match. Not exercised by the demo or spot checks; low risk for the demo set.
