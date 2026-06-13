import type { Report } from './types.js';

// In-memory state: a single run at a time. One global object the SSE stream
// reads (brief §3). No database, no sessions, no concurrency handling.

export type RunStatus = 'running' | 'done' | 'halted' | 'error';

export interface StageEvent {
  type: string;
  ts: number;
  [key: string]: unknown;
}

export interface Run {
  id: string;
  text: string;
  status: RunStatus;
  halted: boolean;
  events: StageEvent[]; // full history, so a late SSE subscriber can catch up
  listeners: Set<(e: StageEvent) => void>;
  result?: Report;
  error?: string;
  startedAt: number;
}

let current: Run | null = null;
let counter = 0;

export function createRun(text: string): Run {
  counter += 1;
  current = {
    id: `run-${Date.now().toString(36)}-${counter.toString(36)}`,
    text,
    status: 'running',
    halted: false,
    events: [],
    listeners: new Set(),
    startedAt: Date.now(),
  };
  return current;
}

export function getRun(id: string): Run | null {
  return current && current.id === id ? current : null;
}

export function emit(run: Run, ev: { type: string; [key: string]: unknown }): void {
  const e: StageEvent = { ...ev, ts: Date.now() };
  run.events.push(e);
  for (const listener of run.listeners) listener(e);
}

/** Mark a run halted. The pipeline checks this flag between every stage. */
export function halt(id: string): boolean {
  const run = getRun(id);
  if (!run) return false;
  if (run.status === 'running') run.halted = true;
  return run.halted;
}

export function isTerminal(status: RunStatus): boolean {
  return status === 'done' || status === 'halted' || status === 'error';
}
