# VERIFICATION.md — Citation Firewall

**Date:** 2026-06-18 (re-grade after post-ship hardening)
**Verifier:** Independent grading sub-agent (Claude, Opus 4.8). I did not write this code.
**Overall verdict:** **PASS WITH NOTES** — all 10 rubric items pass and all machine done-gates pass (36/36 unit, 1/1 e2e, live run + halt). The strengthened honest-label guarantee holds: VERIFIED requires a side-aware substantial name match, and the two planted defects land as FLAGGED and CITE_MISMATCH respectively. One stale README paragraph and one matcher edge case are the only notes (neither can produce a false VERIFIED).

---

## R1–R10

| ID | Verdict | Evidence |
|----|---------|----------|
| **R1** | **PASS** | `curl :3100/` → HTTP 200, serves the HTML app. Full live run (`GET /api/demo` → `POST /api/review` → `curl -sN` SSE) completed in **55s**, terminal `done` event, **no `error`** event. Event tally: 1 extracted, 8 stage, 3 agent, 7 citation, 1 report, 1 done. `pnpm e2e` independently 55.8s (< 90s). |
| **R2** | **PASS** | Live run: all 5 real cites `VERIFIED` with working `courtlistener.com/opinion/...` links (Twombly→145730, Iqbal→145875, Conley→105573, Qualitex→117913, Two Pesos→112783). **Vandermeer Holdings … 742 F.4th 1188 → FLAGGED**, note: *"No matching opinion found in any reporter — hallmark of AI fabrication. BLOCKED from synthesis."* Second mode: **Sunhaven Brands … 784 F.3d 412 → CITE_MISMATCH**, cite resolves to *Arie Friedman v. City of Highland Park* (a real but different case). Both also surface as weaknesses (sev5 / sev4). |
| **R3** | **PASS** | `grep -rn "['\"]VERIFIED['\"]" src/` finds the quoted literal only in `src/verifier.ts:107` (single assignment, from a CourtListener response) and `src/types.ts` (type-union comment). No file in `src/agents/*` or `src/anthropic.ts` contains a quoted `VERIFIED` literal — `sutra.ts` mentions the word only as un-quoted prompt prose. `test/r3-grep.test.ts` enforces this (negative control over agent files + positive control on verifier). **Strengthened guarantee verified:** `verifier.ts:105` requires `nameMatches(...)` before VERIFIED; `nameMatches('Miller v. City of Wickliffe','Julious Mosley v. City of Wickliffe') === false` (shared defendant alone does not verify → CITE_MISMATCH). |
| **R4** | **PASS** | Live HALT test: started a run, `POST /api/review/:id/halt` ~4s in → `{"halted":true}`. Stream sequence: `stage:extract:start → extracted → stage:extract:done → halted`. **No council/verify/sutra events** after the halt; terminal event is `halted`. Code: `pipeline.ts` calls `stopIfHalted()` before every stage; `test/halt.test.ts` (4 tests) covers halt-during-extract and halt-during-council. |
| **R5** | **PASS** | `curl -s :3100/ | grep -i "sk-ant\|ANTHROPIC_API_KEY\|COURTLISTENER_TOKEN"` → empty. Served HTML's only network calls are `fetch("/api/demo")`, `/api/review`, and `/api/review/:id/halt` — all `/api/*`. Keys read server-side from `process.env` (`anthropic.ts:16`, `pipeline.ts:21`). Static-file architecture makes a key leak structurally impossible. |
| **R6** | **PASS** | `pipeline.ts:76` filters opposing-counsel attacks through `passageInBrief` (`util.ts`), reporting drops rather than silently keeping them. Live run: **3 attacks kept, 1 dropped**; all 3 kept passages confirmed present verbatim (whitespace/quote-tolerant) in the demo brief. |
| **R7** | **PASS** | `buildReport` (`pipeline.ts:150`) injects every FLAGGED/CITE_MISMATCH/UNVERIFIED authority as a weakness (FLAGGED=sev5, CITE_MISMATCH=sev4, UNVERIFIED=sev3), de-dupes Sutra weaknesses, and sorts by severity desc. Live report: Vandermeer sev5 first, then Sunhaven sev4, descending to sev2. `test/buildReport.test.ts` (2 tests) asserts the sev-5 injection + sort. |
| **R8** | **PASS** | README has the problem statement, a 60-second quickstart, an architecture diagram + pipeline table, and a "Built today vs. brought in" section. `LICENSE` is MIT (Copyright 2026 jbwagoner). `git ls-files` shows `BRIEF.md`, `PLAN.md`, `RUBRIC.md`, `VERIFICATION.md` all committed. *(Note: see N1 — README's "What you'll see" still describes the old single-defect demo.)* |
| **R9** | **PASS** | `.env.example` documents both env vars (`ANTHROPIC_API_KEY`, `COURTLISTENER_TOKEN`) + optional `PORT`. README quickstart is `git clone → pnpm install → export keys → pnpm start`; `package.json` `start` = `tsx src/server.ts` (no build step). A fresh clone with the two documented vars reaches a working run well under 5 min. |
| **R10** | **PASS** | `public/index.html` defines all BRIEF §7 tokens (`--bg #0a1018`, `--panel #0f1722`, `--ice #8fd3e8`, `--verified #5bc98c`, `--warn #e0b454`, `--danger #e06c5b`). `--saffron #e3a23c` is defined once and used **only** on `.sutra .eyebrow` and `.sutra h3` (lines 152–153) — Sutra synthesis elements exclusively. |

---

## Done-gates

| Gate | Result |
|------|--------|
| `pnpm test` (unit) | **36/36 passed** in 1.13s — 6 files: `r3-grep` (2), `citeParser` (16), `verifier` (8), `zod` (4), `buildReport` (2), `halt` (4). |
| `pnpm e2e` (live) | **1/1 passed** in **55.8s** (< 90s). Asserts R1 (done, <90s), R2 (Vandermeer FLAGGED / no-matching-opinion, Sunhaven CITE_MISMATCH ≠ VERIFIED, 5 reals VERIFIED with `/opinion/` links), R7 (a sev-5 weakness exists). |
| Live curl / run | `:3100/` → HTTP 200; full demo run via HTTP+SSE in **55s**, terminal `done`, no error, 5 VERIFIED + 1 FLAGGED + 1 CITE_MISMATCH. |
| Live HALT | Halt ~4s in → `{"halted":true}`; stream ends at `halted` after `extract:done` with **no** verify/sutra events. |

---

## Honest-label verification

- **Miller/Mosley (the false-VERIFIED this hardening fixed):** `nameMatches('Miller v. City of Wickliffe', 'Julious Mosley v. City of Wickliffe') === false` — confirmed by direct `tsx` invocation of `src/verifier.ts`'s exported `nameMatches`. A shared defendant ("v. City of Wickliffe") alone does **not** verify; in the verifier such a cite becomes **CITE_MISMATCH**, never VERIFIED. Also confirmed false for `Smith v. County of LA` / `Johnson v. County of LA` and `Sunhaven … v. Meridian` / `Arie Friedman v. City of Highland Park`.
- **Abbreviation / initials tolerated (true positives):** `nameMatches('Bethel School Dist. v. Fraser', 'Bethel School District No. 403 v. Fraser') === true`; `nameMatches('M.A.L. v. Kinsland', 'M.A.L. Ex Rel. M.L. v. Kinsland') === true`; exact `Bell Atlantic … v. Twombly` === true. Side-aware logic (`splitParties` + `sideVerdict`) requires one side to positively match and neither side to definitely mismatch; reversed captions accepted.
- **Two demo failure modes (live, end-to-end):**
  - **FLAGGED** — `Vandermeer Holdings, LLC v. Calloway Logistics, Inc., 742 F.4th 1188`: no opinion anywhere → `FLAGGED`, note contains "no matching opinion", **no URL**, sev-5 weakness, blocked from synthesis.
  - **CITE_MISMATCH** — `Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412`: cite resolves to the real *Arie Friedman v. City of Highland Park* (`/opinion/2796697/...`) → `CITE_MISMATCH` (never VERIFIED, never FLAGGED), note says "confirm this is the intended authority", sev-4 weakness.

---

## Notes / risks

- **N1 (doc drift — non-blocking):** README's "What you'll see (the demo)" section still describes the *pre-hardening* single-defect demo — it names **Sunhaven** as the planted fabrication that comes back "✕ FLAGGED" and does not mention **Vandermeer**. The code, `demo/sampleBrief.ts`, RUBRIC.md, and PLAN.md all correctly describe the two-defect model (Vandermeer→FLAGGED, Sunhaven→CITE_MISMATCH). The README architecture section and `.env.example` are otherwise accurate; this is a stale paragraph, not a behavioral defect. Worth a one-line fix before judging.
- **N2 (matcher edge case — fails safe):** `tokenize()` keeps only ≥4-char words, so a case whose surnames on BOTH sides are ≤3 chars (e.g. "Doe v. Roe") tokenizes to empty → no positive side match → `nameMatches` returns `false` even against an identical CourtListener name. This produces a **false negative** (such a cite would land as CITE_MISMATCH, not VERIFIED) — it errs toward caution and can **never** create a false VERIFIED. "Roe v. Wade" is fine ("Wade" is 4 chars). No demo cite is affected.
- **N3 (CourtListener throttle):** `citation-lookup` is 5 req/min; the verifier batches the whole brief into one `prime()` call to stay under it. Rapid repeated full demo re-runs (each a fresh batch + per-name searches for unresolved cites) could still hit a 429; on 429 the client returns `null` → cites degrade to **UNVERIFIED** ("database unavailable"), never a false VERIFIED. Allow a minute between back-to-back demos.
- **N4 (port 3000 conflict):** Port 3000 on the VPS is held by an unrelated docker-proxy; the app runs on **3100** (public via nginx at `https://firewall.iceclaw.online`). `.env.example`/README still default `PORT=3000`; a fresh local clone is unaffected, but the deploy port differs from the documented default by design.
- **N5 (single in-memory run):** State is one global-ish in-memory run map, single run at a time, no persistence (per BRIEF §3 — intended for a demo). A server restart drops in-flight runs; concurrent runs are not isolated. Acceptable for the stated scope.
