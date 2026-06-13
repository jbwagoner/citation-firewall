# Citation Firewall

**Every citation. Checked against real courts. Before you file.**

Attorneys keep getting sanctioned for filing AI-drafted briefs with **hallucinated citations** — fake cases with plausible names and realistic reporters. It has kept happening since 2023. Generic AI checks nothing; the lawyer finds out when the judge does.

Citation Firewall makes that impossible. Paste a draft brief and:

1. An **adversarial council of AI agents** attacks its arguments.
2. **Every cited authority is checked against [CourtListener](https://www.courtlistener.com)'s live database of real court opinions** before it reaches you.
3. You get a **Citation Ledger** — every authority with a database-backed verdict, real opinions linked — and a **severity-ranked weakness report** with repairs.

> **VERIFIED means a real opinion exists in a real reporter — not that a model thinks it sounds right.** A planted fabricated case turns red: *"no matching opinion found in CourtListener."*

For litigators and small firms drafting with AI and no verification layer between draft and courthouse.

---

## 60-second quickstart

Requires **Node ≥ 20** and **pnpm**. Two env vars (see [`.env.example`](./.env.example)):

```bash
git clone https://github.com/<owner>/citation-firewall.git
cd citation-firewall
pnpm install

export ANTHROPIC_API_KEY=sk-ant-...        # the AI council + Sutra synthesis
export COURTLISTENER_TOKEN=...             # https://www.courtlistener.com/profile/tokens/
export PORT=3000                           # optional, defaults to 3000

pnpm start
# → Citation Firewall listening on http://0.0.0.0:3000
```

Open the URL, click **"Load demo brief"**, hit **Run the firewall**, and watch the council deliberate while the ledger fills in. The planted fake citation turns red.

**Tests:**

```bash
pnpm test   # unit: parser, verifier mapping (mocked CourtListener), halt-between-stages, zod rejection, R3 grep
pnpm e2e    # live: runs the demo brief through the real pipeline, asserts the fake flags & the reals verify
```

---

## What you'll see (the demo)

The demo brief is a ~600-word trademark motion to dismiss with **five real, stable citations** (Twombly, Iqbal, Conley, Qualitex, Two Pesos) and **one planted fabrication** — `Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015)`. The five reals come back **✓ VERIFIED** with working links to the actual CourtListener opinions. The fabrication comes back **✕ FLAGGED** — that reporter cite resolves to a *different, real* case, so the cited case+cite pair does not exist. Classic AI fabrication, caught before filing. It is also surfaced as a **severity-5 weakness** and **blocked from the synthesis**.

---

## Architecture

One Node process (**Hono**) serves the API *and* the single static `public/index.html`. One port, one thing to run. No database, no auth, no bundler, no second server — state is in-memory, one run at a time.

```
Browser (one HTML file, EventSource)  ──  Hono (single process) :PORT
  GET  /                  serves public/index.html
  GET  /api/demo          the demo brief text
  POST /api/review        { text } → starts the run, returns { runId }
  GET  /api/review/:id    SSE stream of stage events
  POST /api/review/:id/halt
```

**Pipeline** (state machine; `halted` is checked before *every* stage):

| Stage | Who | Model | What |
|------|-----|-------|------|
| 0 · Extract | one call | Sonnet 4.6 | brief text → arguments + citation strings |
| 1 · Council | 3 parallel, isolated contexts | Sonnet 4.6 | **Opposing Counsel** (attacks, each quoting a verbatim passage), **Case Strategist** (repairs + strongest theory), **Risk Assessor** (severity 1–5) |
| 2 · Verify | **code, not a model** | — | every citation → CourtListener REST v4 |
| 3 · Sutra | one call | Opus 4.8 | reconciles council + the verified ledger → the report |

Each agent is one Anthropic call with an isolated context, a JSON-only response, **zod-validated** (model output shape is never trusted), a 90s timeout and one retry.

### The verification, in detail (`src/verifier.ts`)

Per citation: parse a `Name v. Name, 123 F.3d 456 (1999)` pattern (unparseable → `UNVERIFIED`), then look it up in CourtListener:

- **exact reporter cite + matching case name → `VERIFIED`** (with a link to the real opinion)
- name found, but not at the cited cite → `HIGH_CONFIDENCE`
- cite resolves to a *different* case, or no opinion anywhere → `FLAGGED`
- CourtListener unreachable → `UNVERIFIED` (database unavailable — **never** a false VERIFIED)

CourtListener's `citation-lookup` endpoint is throttled to 5 req/min, so **all** citations are sent in a single batch call, then each verdict is read from cache (name-search only the unresolved ones).

> **Honest labels are non-negotiable.** `status = 'VERIFIED'` is assigned in exactly one place — `src/verifier.ts`, from a CourtListener response. **No model call can ever set it.** This is grep-checkable and enforced by a test ([`test/r3-grep.test.ts`](./test/r3-grep.test.ts)).

---

## Built today vs. brought in

**Everything in this repo was written during Claude Build Day (Shack15 SF, June 13–14, 2026) by Claude (Opus 4.8) via Claude Code.** No prior code was copied in.

**Brought as inputs (not code):**

- This build brief ([`BRIEF.md`](./BRIEF.md)).
- A pre-existing design-token palette (the colors/fonts in [§7 of the brief](./BRIEF.md), used verbatim in `public/index.html`).
- The operator's CourtListener account (the API token).

**Brought as dependencies (off-the-shelf, installed):** Hono, `@hono/node-server`, the Anthropic SDK, zod, and the dev toolchain (tsx, vitest, typescript). Nothing else.

The grading artifacts live alongside this README: [`PLAN.md`](./PLAN.md), [`RUBRIC.md`](./RUBRIC.md), and [`VERIFICATION.md`](./VERIFICATION.md) (an independent sub-agent's pass/fail grade of R1–R10).

---

## Deployment

The single Hono process runs in `tmux` on the operator's Iceland VPS:

```bash
tmux new-session -d -s citation-firewall \
  -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
  -e "COURTLISTENER_TOKEN=$COURTLISTENER_TOKEN" \
  -e "PORT=3000" \
  "cd citation-firewall && pnpm start"
```

That host:port is the live URL — no platform build pipeline, no cold starts.

## License

MIT — see [`LICENSE`](./LICENSE).
