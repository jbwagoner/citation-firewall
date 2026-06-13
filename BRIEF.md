# BUILD DAY BRIEF — Citation Firewall (Minimal Stack)

**Event:** Claude Build Day · Shack15 SF · Saturday June 13, 2026
**Builder:** Claude (Opus 4.8) via Claude Code, running with minimal intervention
**Operator:** JB Wagoner (OneZeroEight.ai) — driving from a MacBook Air, SSH'd into an Iceland VPS where the build and the app both run in tmux
**Repo:** public GitHub repo `citation-firewall` (MIT) — every line written today

**Why minimal:** the operator builds on Windows day-to-day and is on an unfamiliar Mac over contested event wifi. Every removed dependency is one fewer thing that can break under demo pressure. This brief deliberately strips the stack to: Node + Hono + one HTML file + the Anthropic API + the CourtListener API. No database, no auth, no bundler, no PDF parsing, no separate front-end server. Do not add tooling back unless a done-gate requires it.

## 0. Autonomy Contract — how to work today

Scored from the session log: few, high-value human interventions; failures you catch yourself (tests, verifier, rubric) count for you.

- Read this whole brief. Ask ALL clarifying questions in ONE batch at the start, then run.
- Maintain PLAN.md. Write RUBRIC.md (Section 9) into the repo first thing.
- Before declaring any milestone done, spawn a verifier sub-agent in a fresh context to grade against the rubric and done-gates (Section 10). The builder may not self-certify. Fail → fix → re-verify. Log each pass.
- Break something → diagnose and fix it yourself first. Surface to the operator only if blocked > 20 min or a decision changes product behavior.
- Commit small and often, conventional messages. Judges read this repo.
- "Done" = Section 10 gates pass. Don't stop before; don't gold-plate after — go to Section 11.

## 1. The Problem (README + pitch)

Attorneys keep getting sanctioned for filing briefs with AI-hallucinated citations — fake cases with plausible names and realistic reporters. It has kept happening since 2023. Generic AI checks nothing; the lawyer finds out when the judge does.

Citation Firewall makes that impossible: paste a draft brief, an adversarial council of AI agents attacks its arguments, and every cited authority is checked against CourtListener's live database of real court opinions before it reaches the lawyer. VERIFIED means a real opinion exists in a real reporter — not that a model thinks it sounds right.

For: litigators and small firms drafting with AI and no verification layer between draft and courthouse.

## 2. What Done Looks Like

A live URL where a visitor, with zero setup:

- Clicks "Load demo brief" (or pastes their own text)
- Watches a live multi-agent deliberation attack the brief
- Sees a Citation Ledger giving every authority a database-backed verdict — including a planted fabricated case turning red: "no matching opinion found in CourtListener"
- Reads a severity-ranked weakness report with repairs
- Can HALT the run anytime

Plus a public repo with this brief, PLAN.md, RUBRIC.md, VERIFICATION.md, passing tests, and a self-demoing README.

## 3. Stack (minimal — this is the point)

One Node process: Hono. It serves the API routes AND serves the single static `public/index.html`. One port, one thing to run, one thing to deploy.

Front end: one HTML file, no build step. React via CDN `<script>` tags (or vanilla JS — it's one page, three states). Inline `<style>` with the design tokens. No Vite, no bundler, no dist. (Bonus: done-gate R5 is automatic — a static file can't leak a server-side key.)

Agents: Anthropic API, server-side only, current Claude model via event credits.
Verification: CourtListener REST API.
Streaming: SSE from Hono to the page for live deliberation events.
State: in-memory, single run at a time. One global run object the SSE stream reads. No sessions, no concurrency handling — it's a demo.

No: database, auth, payments, PDF parsing, file uploads, second server.

## 4. Architecture

```
Browser (one HTML file, EventSource) ── Hono (single process) :PORT
  GET  /                  serves public/index.html
  POST /api/review        { text } → starts the run, returns runId
  GET  /api/review/:id    SSE stream of stage events
  POST /api/review/:id/halt
```

Pipeline (state machine; check `halted` between EVERY stage):

- **Stage 0  Extract**     text → arguments + citation strings (one model call)
- **Stage 1  Council**     parallel, independent contexts:
  - Opposing Counsel — attacks each argument, ties to a quoted passage
  - Case Strategist  — repairs + strongest surviving theory
  - Risk Assessor    — severity 1–5 per weakness + rationale
- **Stage 2  Verifier**    every citation → CourtListener (CODE, not a model verdict)
- **Stage 3  Sutra**       reconciles council + verified ledger → the report

Each agent = one Anthropic call, isolated context, JSON-only response, zod-validated (never trust model output shape). Timeout 90s, one retry. Sutra is forbidden from relying on any authority not marked VERIFIED.

## 5. Citation Verification (the heart — build this first)

Per citation string:

- Parse a case-cite pattern (`Name v. Name, 123 F.3d 456 (9th Cir. 1999)`). Unparseable → UNVERIFIED.
- CourtListener (`https://www.courtlistener.com/api/rest/v4/`), token from env `COURTLISTENER_TOKEN`:
  - exact reporter-cite match → VERIFIED (store the opinion URL; ledger links to the real case)
  - name found, cite mismatch → HIGH CONFIDENCE + note
  - no match → FLAGGED — no matching opinion found (the demo moment)
- Honest labels (non-negotiable): VERIFIED is ONLY ever a CourtListener confirmation. CourtListener unreachable → UNVERIFIED (database unavailable). Never fabricate or model-guess a VERIFIED.
- Sequential calls with a small delay are fine at demo scale; cache by normalized cite for re-runs.

A model call may extract/normalize citation strings. A model call may NEVER set status = VERIFIED. (This is grep-checkable: done-gate R3.)

## 6. Agent Contracts (author full prompts yourself; keep invariants)

Each: isolated context, JSON-only + zod schema, ≤180 words, mandate-locked.

- **Opposing Counsel:** attacks each argument (weak facts, adverse authority, procedural exposure); every attack quotes the passage it targets.
- **Risk Assessor:** scores each weakness 1–5; says what makes it survivable or fatal.
- **Sutra:** input = council output + post-verification ledger. Output `{synthesis, weaknesses:[{title,severity,passage,repair}], next_steps[]}`, severity-sorted; any reliance on FLAGGED/UNVERIFIED authority is itself listed as a weakness.

## 7. UI (one page, three states: landing → live → report)

Design tokens (use exactly — existing product language):

- bg `#0A1018`, panels `#0F1722`, hairlines `#1D2B3A`, text `#D9E2EA`, muted `#7B8B9A`
- ice `#8FD3E8` = agents & primary actions; saffron `#E3A23C` = Sutra synthesis ONLY
- verified `#5BC98C`, warn `#E0B454`, danger `#E06C5B`
- fonts (CDN): Cormorant Garamond (display), IBM Plex Sans (body), IBM Plex Mono (citations, status chrome, the `{slug}.session` header)
- conventions: terminal-style session header, numbered agent eyebrows, pulsing status lights while deliberating, ✓/◐/⚠/✕ ledger marks, ■ HALT top-right, prefers-reduced-motion respected

Landing sells in one screen: headline "Every citation. Checked against real courts. Before you file.", one-line sanctions problem, a large textarea, and a prominent "Load demo brief" button (fills the textarea — judges run it with zero files).

The ledger is the star. Each row: mark, label, citation in mono, verdict note; VERIFIED rows link to the real CourtListener opinion; FLAGGED rows get danger styling + "No matching opinion found in any reporter — hallmark of AI fabrication. BLOCKED from synthesis."

## 8. Demo Asset (it's product, not afterthought)

A demo brief as a string constant in the repo (`demo/sampleBrief.ts`) — no PDF, no binary. A ~600-word trademark motion-to-dismiss containing 5 real, verifiable citations (famous, stable cases you are certain exist — Stage 2 confirms them live with links) and 1 planted fabricated case with a convincing name + reporter cite that does not exist. Include one genuinely weak argument for Opposing Counsel to shred. The "Load demo brief" button pastes this text.

## 9. RUBRIC.md

(written verbatim into the repo — see RUBRIC.md)

## 10. Done-Gates (machine-verifiable; all pass before "done")

1. `pnpm test` green — citation parser; verifier mapping (mocked CourtListener: exact→VERIFIED, name-only→HIGH CONFIDENCE, miss→FLAGGED, network-fail→UNVERIFIED-degraded); halt-between-stages; zod rejection of malformed agent JSON.
2. `pnpm e2e` — runs the demo brief through the LIVE pipeline and asserts R1 + R2 programmatically.
3. `curl` the deployed URL returns the app; one full production demo run before feature freeze.
4. Verifier sub-agent grades R1–R10 → writes VERIFICATION.md (pass/fail + evidence). Any fail → fix → re-grade. Commit the passing report.

## 11. If Time Remains (in order; only after gates pass)

- Polish the FLAGGED moment (red pulse on arrival, ledger auto-scrolls to it)
- Per-citation CourtListener latency shown in the ledger (proves it's real)
- "Copy report" / print stylesheet
- PDF upload — add file upload + server-side text extraction as an alternative input to the textarea. (Moved here deliberately: it's the most failure-prone dependency and adds nothing to the story.)
- A second demo brief (contract dispute) proving generality

## 12. Deployment & Compliance

Deploy = keep it running. The single Hono process runs in tmux on the operator's Iceland VPS, which already has a public IP — that IP:port (or `firewall.iceclaw.online` if DNS is pointed) IS the live URL. No platform build pipeline, no cold starts.

Env: `ANTHROPIC_API_KEY` (event credits), `COURTLISTENER_TOKEN`. Document both in `.env.example`. NEVER write/overwrite an existing `.env` — untouchable user data; use an `ENV_FILE`/temp-file override for any env testing.

Rules: repo public from first push; MIT; README "built today vs. brought in" states — all code written during the event by Claude (Opus 4.8); brought as inputs: this brief, a pre-existing design-token palette, the operator's CourtListener account. No prior code copied in.
