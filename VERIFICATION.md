# VERIFICATION.md — Citation Firewall

**Independent re-grade · 2026-06-18 · Verifier sub-agent (fresh context, did not write the code)**

**Overall verdict: PASS — all R1–R10 pass; all done-gates green.** The honest-label guarantee and the new PDF-paste resilience both hold under live testing: a shared defendant alone does not VERIFY (CITE_MISMATCH), a PDF-mangled landmark with jammed parallel cites VERIFIES, and a nameless subsequent-history fragment is UNVERIFIED (not a false mismatch). Two demo failure modes (FLAGGED + CITE_MISMATCH) both fire live.

## R1–R10

| ID | Verdict | Evidence |
|----|---------|----------|
| **R1** | **PASS** | Live app on `:3100`: `GET /api/demo` → `POST /api/review` → SSE `GET /api/review/:id` completed in **61s** (< 90s), terminal `{"type":"done"}`, **0** `error` events. |
| **R2** | **PASS** | Live ledger: 5 reals (Twombly, Iqbal, Conley, Qualitex, Two Pesos) all **VERIFIED** with `/opinion/` links; **Vandermeer 742 F.4th 1188 → FLAGGED** ("No matching opinion found… BLOCKED from synthesis"); **Sunhaven 784 F.3d 412 → CITE_MISMATCH** (resolves to a different real case). Both non-VERIFIED modes exercised. |
| **R3** | **PASS** | `grep -rn "['\"]VERIFIED['\"]" src/agents/ src/anthropic.ts` → none. Only `src/verifier.ts:123` assigns `'VERIFIED'`, from a CourtListener response. Enforced by `test/r3-grep.test.ts` (2 tests, both pass). Honest-label both directions confirmed live (see below): no false-positive on shared party (Miller→Mosley) and no false-negative on paste-mangled real case (Tinker). |
| **R4** | **PASS** | HALT: `POST /api/review/:id/halt` ~2.5s into a run → events were `stage extract start`, `stage extract done`, `>>> halted`. No council/verify/sutra/report/done events after the halt. |
| **R5** | **PASS** | `curl -s localhost:3100/ \| grep -i sk-ant` → empty; no `anthropic` reference in served HTML. Client only calls `/api/demo`, `/api/review/:id/halt`, `EventSource("/api/review/:id")`. Key is server-side only. |
| **R6** | **PASS** | Live opposing-counsel output: 3 surviving attacks, all passages **verbatim** in the brief; 1 non-verbatim attack correctly **dropped** by the server-side `passageInBrief` filter (`src/pipeline.ts:76`). |
| **R7** | **PASS** | Live report weakness severities `[5,4,4,4,3,3,2]` — sorted descending. Vandermeer (FLAGGED) at sev 5, Sunhaven (CITE_MISMATCH) at sev 4 injected as top weaknesses; `buildReport` (`src/pipeline.ts:150`) forces reliance on FLAGGED/CITE_MISMATCH/UNVERIFIED into high-severity weaknesses and sorts. |
| **R8** | **PASS** | README has problem statement, 60-second quickstart, architecture, and "Built today vs. brought in". `LICENSE` is MIT. `BRIEF.md`, `PLAN.md`, `RUBRIC.md`, `VERIFICATION.md` all committed. |
| **R9** | **PASS** | `.env.example` documents `ANTHROPIC_API_KEY`, `COURTLISTENER_TOKEN`, `PORT`. Minimal stack (`pnpm install` + `pnpm start`, tsx, no build step) → working run well under 5 min. |
| **R10** | **PASS** | Tokens in `public/index.html` match BRIEF §7 (`--ice #8fd3e8`, `--saffron #e3a23c`, etc.). Saffron `#e3a23c` appears in exactly 3 places — its definition and two `.sutra` rules (`.sutra .eyebrow`, `.sutra h3`) — i.e. **only** on Sutra synthesis elements. |

## Done-gates (observed numbers)

| Gate | Result |
|------|--------|
| `pnpm test` | **44/44 pass** (6 files: citeParser 23, verifier 9, halt 4, zod 4, buildReport 2, r3-grep 2) in 1.14s. |
| `pnpm e2e` (live) | **1/1 pass in 55.6s** (< 90s). Asserts fabricated cite FLAGGED + real cites VERIFIED with links (R1+R2) against the live pipeline. |
| Live demo run (`:3100`) | `done` in **61s**, 0 errors; 5 VERIFIED + Vandermeer FLAGGED + Sunhaven CITE_MISMATCH. |
| HALT mid-run | Stopped after `extract`, before `council`/`verify`/`sutra`; emitted `halted`, no later-stage/report/done events. |

## Honest-label & PDF-paste verification

Single `verifyAll` batch call against the live CourtListener client (`createCourtListenerClient` + `verifyAll`), then scratch script deleted (repo clean):

| Input | Expected | Observed | Result |
|-------|----------|----------|--------|
| `Tinker v. Des Moines Indep. Cmty. Sch. Dist., 393 U.S. 503, 89 S.Ct. 733, 21 L.Ed.2d 731 (1969)` (PDF-jammed parallel cites) | VERIFIED, `393 U.S. 503`, link | **VERIFIED**, normalizedCite **`393 U.S. 503`**, link `…/opinion/107841/tinker-v-des-moines…/`. Parallel cites collapsed to the official one. | **PASS** (no false negative) |
| `Miller v. City of Wickliffe, 852 F.3d 497 (6th Cir. 2017)` | CITE_MISMATCH (→ Mosley) | **CITE_MISMATCH** — actualCaseName "Julious Mosley v. City of Wickliffe"; shared defendant ("City of Wickliffe") alone did not verify. | **PASS** (no false positive) |
| `(rev'd on other grounds, 412 U.S. 94 (1973))` | UNVERIFIED (fragment) | **UNVERIFIED** — "Citation fragment — no case name to confirm against the resolved opinion." (cite resolves to CBS v. DNC, but the nameless-fragment guard fires first). | **PASS** (no false CITE_MISMATCH) |

**Demo failure modes (live, confirmed twice — e2e and manual run):**
- **FLAGGED:** Vandermeer Holdings 742 F.4th 1188 → no matching opinion anywhere → danger, blocked from synthesis.
- **CITE_MISMATCH:** Sunhaven Brands 784 F.3d 412 → resolves to a real but different case (Friedman v. City of Highland Park per README; the live cite returned a non-matching real opinion) → "confirm this is the intended authority", not VERIFIED.

## Notes / risks

- **No-separator-jam residual:** the parser anchors on reporters and collapses parallel cites via a separator/pincite gap test (`isParallelGap`). Two cites with *no* separator at all between them remain an edge case; the known parallel-cite forms (comma/semicolon/`at`/`and`) are handled and tested.
- **CourtListener 5/min throttle:** the citation-lookup endpoint is rate-limited. The verifier mitigates by sending one batched `prime()` call per brief, but rapid repeated full runs (or repeated spot-check scripts) can be throttled → uniform `UNVERIFIED` ("unreachable"). Observed clean on this grade; re-runs should be spaced ~60s.
- **Port 3000 conflict:** the chosen port 3000 is occupied on the VPS by an unrelated docker-proxy; the app runs on **3100** (and publicly via nginx at `https://firewall.iceclaw.online`). `.env.example`/README still default to 3000 — a fresh local clone works, but the documented default differs from the deployed port.
- **Single in-memory run:** state is one global run object; concurrent reviews would clobber each other. Acceptable per BRIEF §3 (demo scale), but not multi-user safe.
- **≤3-char-surname matcher edge:** `tokenize` keeps only words ≥4 chars (`src/citeParser.ts:271`), so a caption whose only distinguishing tokens are short surnames (e.g. "Ng v. Do") yields empty token sets → `neutral` sides → the name match can't discriminate and may over-accept. Narrow; the demo + spot-check cases all have ≥4-char distinguishing tokens.

**Re-grade conclusion: PASS. Recommend committing this report.**
