# VERIFICATION.md — Citation Firewall

**Date:** 2026-06-14
**Verifier:** Independent grading sub-agent (Claude, Opus 4.8). I did not write this code.
**Overall verdict:** **PASS** — all 10 rubric items pass; all 3 machine done-gates pass. Minor non-blocking notes below.

---

## R1–R10

| ID | Verdict | Evidence |
|----|---------|----------|
| **R1** | **PASS** | Live app at `:3100` returns HTTP 200 and the HTML app. Full production run (`/api/demo`→`/api/review`→SSE) completed in **52s** end-to-end with a terminal `done` event and no `error` event. `pnpm e2e` independently measured 57.7s (< 90s). |
| **R2** | **PASS** | Live run: all 5 real cites `VERIFIED` with working `courtlistener.com/opinion/...` links (Twombly→145730, Iqbal→145875, Conley→105573, Qualitex→117913, Two Pesos→112783). Fabricated `Sunhaven Brands … 784 F.3d 412` returned **FLAGGED** — its reporter cite resolves to a different real case (Friedman v. City of Highland Park), so the cited case+cite pair does not exist. |
| **R3** | **PASS** | `grep -rn "['\"]VERIFIED['\"]" src/` yields the quoted literal only in `src/types.ts` (type-union def) and `src/verifier.ts:93` (the single assignment, from a CourtListener response). No file in `src/agents/*` or `src/anthropic.ts` contains a quoted `VERIFIED` literal — only un-quoted prose in `sutra.ts` prompt. `test/r3-grep.test.ts` enforces this with a regex `/['"]VERIFIED['"]/` over every agent file + `anthropic.ts` (negative control) plus a positive control on `verifier.ts`. Test passes. |
| **R4** | **PASS** | Live HALT test: started a run, POSTed `/halt` ~3s in. Event sequence was `stage:extract:start → extracted → stage:extract:done → halted`. No `council`/`agent`/`verify`/`sutra` events after halt — pipeline stopped before the next stage. Matches `pipeline.ts:41-48` (`stopIfHalted()` checked before every stage) and the UI `halted` banner (`index.html:364-367`). |
| **R5** | **PASS** | `curl -s http://localhost:3100/ \| grep -i "sk-ant\|ANTHROPIC_API_KEY\|COURTLISTENER_TOKEN"` → empty. `public/index.html` has no Anthropic reference; all client calls are `/api/demo`, `/api/review/.../halt`, `EventSource("/api/review/...")`. Key is read server-side only in `src/anthropic.ts:16`. |
| **R6** | **PASS** | `src/pipeline.ts:76` filters attacks through `passageInBrief` (`src/util.ts:12`). In the live run, both surviving Opposing Counsel attacks were verbatim substrings of the demo brief (verified programmatically), and **1 attack was dropped** (`dropped: 1`) for failing the verbatim check — proving the filter is live, not cosmetic. |
| **R7** | **PASS** | `buildReport` (`src/pipeline.ts:150-173`) injects every FLAGGED authority as a severity-5 weakness and sorts desc. Live `report` event: sev-5 "Reliance on unverifiable authority: Sunhaven…" at top, then 4,4,3,3,2 in strict descending order. |
| **R8** | **PASS** | README has Problem, "60-second quickstart", Architecture, and "Built today vs. brought in". `LICENSE` is MIT. `git ls-files` includes `BRIEF.md`, `PLAN.md`, `RUBRIC.md`, `README.md`, `LICENSE`. |
| **R9** | **PASS** | `.env.example` documents both env vars + optional PORT. README quickstart is `pnpm install` then `export` keys then `pnpm start` (`package.json` `start` = `tsx src/server.ts`). No build step, no DB, no second server. Nothing observed that would block a fresh clone reaching a working run in < 5 min. |
| **R10** | **PASS** | BRIEF §7 tokens reproduced exactly in `:root` (`index.html:14-28`): bg `#0a1018`, panel `#0f1722`, hair `#1d2b3a`, text `#d9e2ea`, muted `#7b8b9a`, ice `#8fd3e8`, saffron `#e3a23c`, verified `#5bc98c`, warn `#e0b454`, danger `#e06c5b`. Saffron (`--saffron` and rgba `227,162,60`) appears ONLY on `.sutra` synthesis elements (lines 147-149); ice is used for agents/actions. |

---

## Done-gates

**Gate 1 — `pnpm test`:** PASS. 6 files, **23 tests passed, 0 failed** (892ms). Covers cite parser, verifier mapping (exact→VERIFIED, name-only→HIGH_CONFIDENCE, miss→FLAGGED, network-fail→UNVERIFIED), halt-between-stages, zod rejection, R3 grep, buildReport.

**Gate 2 — `pnpm e2e`:** PASS. 1 test passed in **57.685s** (< 90s budget). Live Anthropic + CourtListener pipeline; asserts R1 + R2 (fabricated FLAGGED, reals VERIFIED with links) programmatically. Exit code 0.

**Gate 3 — curl + production run + halt:**
- `curl -o /dev/null -w "%{http_code}" http://localhost:3100/` → **200**; HTML app served (`<title>Citation Firewall…</title>`).
- Full demo run end-to-end: **52s**, event order extract→council→3 agents→verify→6 citations→report→done, terminal `done`, no error.
- Citation verdicts: 5 VERIFIED (with opinion URLs) + 1 FLAGGED (Sunhaven).
- HALT: `{"halted":true}`; pipeline emitted `halted` after extract, no later-stage events.

---

## Notes / risks (non-blocking)

- **Latency headroom is real but not huge.** Observed 52s (live curl) and 57.7s (e2e) against a 90s budget — comfortable, but Opus/Sonnet or CourtListener latency spikes could push closer. The per-agent timeout is 90s with one retry (`src/anthropic.ts`), so a single retry on a slow stage could in principle approach or exceed the 90s end-to-end target. Not observed in this grading.
- **Port mismatch between docs and deployment.** README/`.env.example`/deploy snippet say PORT **3000**; the graded live instance runs on **3100**. Harmless (the deploy sets PORT), but a fresh reader copying the README literally would land on 3000. Worth a one-line note, not a failure.
- **FLAGGED reasoning for the fabrication is "resolves to a different case," not "no opinion anywhere."** The Sunhaven cite (784 F.3d 412) maps to a real but different opinion, so the note says "resolves to a different case (… BLOCKED from synthesis)" rather than "no matching opinion." This still satisfies R2 (fabrication caught, blocked, sev-5) and the README anticipates exactly this ("that reporter cite resolves to a *different, real* case"). Worth knowing the exact wording differs from the generic "no matching opinion" phrasing in the rubric.
- **`nameMatches` is deliberately lenient** (single shared significant token → match; `src/citeParser.ts:88-93`). Correct for the demo, but a brief whose fabricated case happened to share a surname token with whatever real opinion sits at the cited reporter could in theory VERIFY a fabrication. Out of scope for this demo; flagging as a design edge.
- **Single global run / in-memory state** (`src/run.ts`): one run at a time, no concurrency. By design (brief §3); a concurrent second `POST /api/review` would replace `current` and orphan the first run's `getRun`. Fine for a demo, noted for completeness.
