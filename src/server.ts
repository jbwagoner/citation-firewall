import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createRun, getRun, halt, isTerminal, type StageEvent } from './run.js';
import { runPipeline } from './pipeline.js';
import { DEMO_BRIEF } from '../demo/sampleBrief.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = join(__dirname, '..', 'public', 'index.html');

const app = new Hono();

// GET / — serve the single static page. Read per request so the file can be
// edited live; it never contains a server-side key (RUBRIC R5).
app.get('/', (c) => c.html(readFileSync(INDEX_HTML, 'utf8')));

// GET /api/demo — the demo brief text (single-sourced in demo/sampleBrief.ts).
// The "Load demo brief" button pastes this into the textarea.
app.get('/api/demo', (c) => c.json({ text: DEMO_BRIEF }));

// POST /api/review — start a run, return its id. The pipeline runs in the
// background; the client subscribes via SSE.
app.post('/api/review', async (c) => {
  const body = await c.req.json().catch(() => ({}) as { text?: string });
  const text = (body?.text ?? '').toString();
  if (!text.trim()) return c.json({ error: 'text is required' }, 400);

  const run = createRun(text);
  // Fire and forget — runPipeline handles its own errors and emits them. The
  // .catch is a backstop so a rejected promise can never crash the process.
  runPipeline(run).catch((err) => {
    run.status = 'error';
    run.error = err instanceof Error ? err.message : String(err);
  });
  return c.json({ runId: run.id });
});

// GET /api/review/:id — SSE stream of stage events. Replays history first so a
// late subscriber catches up, then tails live events until a terminal event.
app.get('/api/review/:id', (c) => {
  const run = getRun(c.req.param('id'));
  if (!run) return c.text('run not found', 404);

  return streamSSE(c, async (stream) => {
    // Drain queue: history first, then live events. Every write is AWAITED
    // before the next, so terminal events (report/done) are flushed before the
    // stream closes — a late subscriber and the live subscriber both get the
    // full sequence.
    const queue = [...run.events];
    let aborted = false;
    let wake: (() => void) | null = null;

    const isTerminalEvent = (t: string) => t === 'done' || t === 'halted' || t === 'error';

    const listener = (e: StageEvent) => {
      queue.push(e);
      wake?.();
    };
    run.listeners.add(listener);
    stream.onAbort(() => {
      aborted = true;
      wake?.();
    });

    try {
      while (!aborted) {
        while (queue.length > 0) {
          const e = queue.shift()!;
          await stream.writeSSE({ data: JSON.stringify(e) });
          if (isTerminalEvent(e.type)) return;
        }
        if (isTerminal(run.status) && queue.length === 0) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
    } finally {
      run.listeners.delete(listener);
    }
  });
});

// POST /api/review/:id/halt — stop the pipeline before the next stage.
app.post('/api/review/:id/halt', (c) => {
  const ok = halt(c.req.param('id'));
  return c.json({ halted: ok });
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`Citation Firewall listening on http://0.0.0.0:${info.port}`);
});

export { app };
