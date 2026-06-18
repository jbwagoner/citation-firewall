# RUBRIC.md — Citation Firewall

The verifier sub-agent grades the build against R1–R10. All must pass before "done."

| ID | Requirement |
|----|-------------|
| **R1**  | Live URL loads; demo brief runs end-to-end in < 90s with no errors. |
| **R2**  | Planted fabricated cite is FLAGGED ("no match found — verify manually"); all real demo cites are VERIFIED with working CourtListener links. |

> **Honest-label guarantee (the heart of R2/R3):** `VERIFIED` requires BOTH the reporter cite to resolve AND the case name to *substantially* match — compared side-aware (`Plaintiff v. Defendant`), so a shared defendant alone (e.g. "v. City of Wickliffe") is never sufficient. A cite that resolves to a *different* real case is **`CITE_MISMATCH`** ("confirm this is the intended authority"), never `VERIFIED`. The demo exercises both non-VERIFIED failure modes: a cite with no CourtListener match → `FLAGGED` ("no match found — verify manually"; a flag means *could not confirm*, not *proven fake*), and a cite that resolves to a different real case → `CITE_MISMATCH`. Honest labeling is the point: a no-match may be a fabrication OR an unpublished / very recent / uncovered opinion.
| **R3**  | `status=VERIFIED` is set only from a CourtListener response — grep proves no model call can set it. |
| **R4**  | HALT stops the pipeline before the next stage; UI reflects it. |
| **R5**  | Anthropic key is server-side only; never in the served HTML/client. |
| **R6**  | Every Opposing Counsel attack quotes a passage that actually appears in the brief text. |
| **R7**  | Report is severity-sorted; reliance on flagged authority is a weakness. |
| **R8**  | README: problem, 60-second quickstart, architecture, "built today vs. brought in" section. MIT. brief + PLAN.md + RUBRIC.md committed. |
| **R9**  | Fresh clone + documented env vars → working local run in < 5 min. |
| **R10** | UI matches tokens; saffron appears ONLY on Sutra synthesis elements. |

## Done-Gates (machine-verifiable; all pass before "done")

1. `pnpm test` green — citation parser; verifier mapping (mocked CourtListener: exact→VERIFIED, name-only→HIGH CONFIDENCE, miss→FLAGGED, network-fail→UNVERIFIED-degraded); halt-between-stages; zod rejection of malformed agent JSON.
2. `pnpm e2e` — runs the demo brief through the LIVE pipeline and asserts R1 + R2 programmatically.
3. `curl` the deployed URL returns the app; one full production demo run before feature freeze.
4. Verifier sub-agent grades R1–R10 → writes VERIFICATION.md (pass/fail + evidence). Any fail → fix → re-grade. Commit the passing report.
