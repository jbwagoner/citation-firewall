# PLAN.md — Citation Firewall

Living plan. Updated as milestones land. Grade against [RUBRIC.md](./RUBRIC.md).

## Operator decisions (locked at kickoff, 2026-06-13)

| Decision | Choice |
|----------|--------|
| Live URL / port | `http://194.247.183.32:3000` — bind `0.0.0.0:3000` direct on the Iceland VPS |
| Models | **Sonnet 4.6** (`claude-sonnet-4-6`) for Extract + Council; **Opus 4.8** (`claude-opus-4-8`) for Sutra synthesis |
| Deploy | I launch + keep running in tmux on this VPS, run the production demo, curl the live URL for the gate |
| Front end | Vanilla JS, single `public/index.html`, no bundler, no JS CDN (only fonts via CDN) |

## Stack (minimal — the point)

One Node process: **Hono** serves both API routes and the static `public/index.html`. One port, one thing to run.
- Language: TypeScript run directly via `tsx` (no build/dist step for dev/prod; `tsx src/server.ts`).
- Validation: `zod` on every agent JSON response (never trust model output shape).
- Tests: `vitest` (`pnpm test` unit, `pnpm e2e` live).
- State: in-memory, single run at a time. One global run object the SSE stream reads.
- No: database, auth, payments, second server, bundler.

## Architecture

```
Browser (index.html, EventSource) ── Hono (single process) :3000
  GET  /                  serves public/index.html
  POST /api/review        { text } → starts the run, returns { runId }
  GET  /api/review/:id    SSE stream of stage events
  POST /api/review/:id/halt
```

### Pipeline (state machine; check `halted` between EVERY stage)
- **Stage 0 — Extract** (Sonnet): text → arguments[] + citation strings[] (one model call).
- **Stage 1 — Council** (Sonnet, parallel, isolated contexts):
  - Opposing Counsel — attacks each argument, every attack quotes a passage from the brief.
  - Case Strategist — repairs + strongest surviving theory.
  - Risk Assessor — severity 1–5 per weakness + rationale.
- **Stage 2 — Verifier** (CODE, not a model): every citation → CourtListener. This is the heart; built first.
- **Stage 3 — Sutra** (Opus): reconciles council + verified ledger → the report. Forbidden from relying on any authority not marked VERIFIED; reliance on FLAGGED/UNVERIFIED is itself a listed weakness.

Each agent: one Anthropic call, isolated context, JSON-only response, zod-validated, ≤180-word prompt, mandate-locked. Timeout 90s, one retry.

## Citation verification (build FIRST — RUBRIC R2/R3)

Per citation string:
1. Parse `Name v. Name, 123 F.3d 456 (9th Cir. 1999)`. Unparseable → `UNVERIFIED`.
2. CourtListener REST v4 (`https://www.courtlistener.com/api/rest/v4/`), token `COURTLISTENER_TOKEN`:
   - Primary: `POST /citation-lookup/` with the reporter cite (parses + returns matching opinions with cluster IDs).
   - Fallback / name check: `GET /search/?q=...&type=o`.
   - exact reporter-cite match → `VERIFIED` (store opinion URL; ledger links to the real case).
   - name found, cite mismatch → `HIGH_CONFIDENCE` + note.
   - no match → `FLAGGED` — "no matching opinion found" (the demo moment).
   - CourtListener unreachable → `UNVERIFIED` (database unavailable). NEVER a VERIFIED.
3. Cache by normalized cite for re-runs. Sequential calls + small delay are fine at demo scale.

**Invariant (R3, grep-checkable):** A model call may extract/normalize citation strings. A model call may NEVER set `status = VERIFIED`. VERIFIED is assigned only in `src/verifier.ts` from a CourtListener response.

## Status → ledger mark mapping
| status | mark | styling |
|--------|------|---------|
| VERIFIED | ✓ | verified green, links to CourtListener |
| HIGH_CONFIDENCE | ◐ | warn |
| UNVERIFIED | ⚠ | warn / muted ("database unavailable" or "unparseable") |
| FLAGGED | ✕ | danger, "No matching opinion found… BLOCKED from synthesis." |

## UI (one page, three states: landing → live → report)

Design tokens used exactly (see brief §7). Saffron `#E3A23C` ONLY on Sutra synthesis elements (R10).
- Landing: headline "Every citation. Checked against real courts. Before you file.", sanctions one-liner, large textarea, prominent "Load demo brief" button (fills textarea with the demo constant).
- Live: terminal-style `{slug}.session` header, numbered agent eyebrows, pulsing status lights, ■ HALT top-right, `prefers-reduced-motion` respected.
- Report: Citation Ledger is the star (✓/◐/⚠/✕ marks, mono cites, verdict notes, VERIFIED links out); severity-sorted weakness report with repairs.

## Milestones → done-gates

1. Scaffold (Hono + TS + zod + vitest), `.env.example`. → R9 groundwork
2. **Verifier** + parser + unit tests (mocked CL). → R2, R3, gate 1
3. Agents + zod schemas + prompts. → R6, R7
4. Pipeline state machine + SSE + halt. → R4, gate 1 (halt test)
5. Demo brief asset. → R2
6. Front end (vanilla JS, tokens). → R5, R10
7. e2e live test. → gate 2 (R1+R2)
8. README + `.env.example`. → R8, R9
9. Deploy to tmux, production demo run, curl live URL. → gate 3, R1
10. Verifier sub-agent grades R1–R10 → VERIFICATION.md, commit. → gate 4

## Verification discipline (autonomy contract §0)
Before declaring any milestone done, spawn a verifier sub-agent in a fresh context to grade against the rubric + done-gates. Builder may not self-certify. Fail → fix → re-verify. Log each pass here.

### Verification log
- **Done-gate 1 — `pnpm test`:** 23/23 unit tests pass (parser, verifier mapping w/ mocked CourtListener, halt-between-stages, zod rejection, R3 grep proof).
- **Done-gate 2 — `pnpm e2e`:** live pipeline on the demo brief passes in ~52s (<90s); fabricated cite FLAGGED, all 5 real cites VERIFIED with working CourtListener links (R1 + R2).
- **Done-gate 3 — deployed + production run:** app live in tmux on `0.0.0.0:3100` (port note below); `curl /` → HTTP 200; full production demo run over HTTP+SSE in 79s, 5 VERIFIED + 1 FLAGGED; HALT mid-run stops the pipeline before the next stage (no verify, no sutra). Found & fixed two bugs en route: deps resolved outside try/catch could crash the process; SSE handler closed before flushing terminal events (now a drain queue with awaited writes).
- **Done-gate 4 — verifier sub-agent → VERIFICATION.md:** independent fresh-context sub-agent graded **PASS on all R1–R10** and all 3 machine gates (`pnpm test` 23/23, `pnpm e2e` 1/1 in 57.7s, live run 52s + halt). Report committed as `VERIFICATION.md`.

### Domain + HTTPS (firewall.iceclaw.online → 127.0.0.1:3100)
Operator request: add a NEW nginx server block reverse-proxying `firewall.iceclaw.online` to the app on `127.0.0.1:3100`, with SSE headers (`proxy_http_version 1.1`, `proxy_set_header Connection ''`, `proxy_buffering off`, long read timeout), then HTTPS via `certbot --nginx`. Shared infra — must NOT modify any existing nginx site, the docker-proxy, or the base.sutra.team containers.
- Acceptance gates: `nginx -t` passes; `systemctl reload` (not restart) so existing sites stay up; both `http://` and `https://firewall.iceclaw.online` reach the app; no existing config touched.
- Conventions matched from `api.iceclaw.online` (port-80 + certbot 443 block, proxy to a 127.0.0.1 port). `default` owns `listen 80 default_server` (`server_name _`), so the name-based vhost coexists. No prior `firewall` reference in `/etc/nginx`.
- Config staged at `~/firewall.iceclaw.online.nginx.conf`. Privileged steps (install/symlink/`nginx -t`/reload/certbot) run by the operator via `!sudo` (my shell's sudo needs a password); I verify http/https with curl between steps.
- **DONE (verified 2026-06-14):** new vhost installed (file + symlink only); `http://firewall.iceclaw.online` and `https://firewall.iceclaw.online` both return HTTP 200 and serve the app; valid Let's Encrypt cert (CN firewall.iceclaw.online, exp 2026-09-11); SSE streams through nginx+TLS; existing sites untouched (`api.iceclaw.online` still 301s). certbot folded `listen 443 ssl` into the same block (no forced redirect), so both protocols reach the app. **Live URL: https://firewall.iceclaw.online**

### Port note (operator decision pending)
Chosen port **3000** is occupied on the VPS by an unrelated root-owned docker-proxy bound to `127.0.0.1:3000`; binding `0.0.0.0:3000` conflicts (EADDRINUSE). I will not stop the operator's container. Deployed on free port **3100** for now and surfaced the public-port decision to the operator (changes the live URL).

## Status
- [x] Kickoff questions answered; RUBRIC.md + PLAN.md written.
- [x] Scaffold
- [x] Verifier + unit tests
- [x] Agents
- [x] Pipeline + SSE + halt
- [x] Demo brief
- [x] Front end
- [x] e2e
- [x] README
- [x] Deploy + production demo (on :3100; public port TBD with operator)
- [x] VERIFICATION.md (verifier sub-agent) — PASS on all R1–R10
