import { describe, it, expect, vi } from 'vitest';
import { createRun } from '../src/run.js';
import { runPipeline, type PipelineDeps } from '../src/pipeline.js';
import type { CourtListenerClient } from '../src/verifier.js';

const fakeExtract = {
  argumentsList: [{ heading: 'a', passage: 'p' }],
  citations: ['Foo v. Bar, 1 U.S. 1 (1900)'],
};

function stubDeps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  const clClient: CourtListenerClient = {
    lookupByCite: vi.fn(async () => null),
    searchByName: vi.fn(async () => null),
  };
  return {
    runExtract: vi.fn(async () => fakeExtract),
    runOpposingCounsel: vi.fn(async () => ({ attacks: [] })),
    runStrategist: vi.fn(async () => ({ repairs: [], strongestTheory: '' })),
    runRiskAssessor: vi.fn(async () => ({ weaknesses: [] })),
    runSutra: vi.fn(async () => ({ synthesis: '', weaknesses: [], nextSteps: [] })),
    clClient,
    ...over,
  } as PipelineDeps;
}

describe('halt stops the pipeline before the next stage (RUBRIC R4)', () => {
  it('halt during Extract → Council never runs', async () => {
    const run = createRun('text');
    const deps = stubDeps({
      runExtract: vi.fn(async () => {
        run.halted = true; // user clicks HALT during stage 0
        return fakeExtract;
      }),
    });
    await runPipeline(run, deps);

    expect(run.status).toBe('halted');
    expect(deps.runOpposingCounsel).not.toHaveBeenCalled();
    expect(deps.runStrategist).not.toHaveBeenCalled();
    expect(run.events.some((e) => e.type === 'halted')).toBe(true);
    expect(run.events.some((e) => e.stage === 'council')).toBe(false);
  });

  it('halt during Council → Verify and Sutra never run', async () => {
    const run = createRun('text');
    const deps = stubDeps({
      runStrategist: vi.fn(async () => {
        run.halted = true; // halt mid-council
        return { repairs: [], strongestTheory: '' };
      }),
    });
    await runPipeline(run, deps);

    expect(run.status).toBe('halted');
    expect(deps.clClient.lookupByCite).not.toHaveBeenCalled();
    expect(deps.runSutra).not.toHaveBeenCalled();
    expect(run.events.some((e) => e.stage === 'verify')).toBe(false);
  });

  it('a clean run reaches done with a report', async () => {
    const run = createRun('text');
    const deps = stubDeps();
    await runPipeline(run, deps);

    expect(run.status).toBe('done');
    expect(deps.runSutra).toHaveBeenCalledOnce();
    expect(run.result).toBeDefined();
    expect(run.events.some((e) => e.type === 'done')).toBe(true);
  });

  it('completes (does not crash) on citation-dense, argument-light text — zero arguments', async () => {
    const run = createRun('TABLE OF AUTHORITIES …');
    const deps = stubDeps({
      // Extract finds citations but NO developed arguments.
      runExtract: vi.fn(async () => ({
        argumentsList: [],
        citations: ['Foo v. Bar, 1 U.S. 1 (1900)'],
      })),
    });
    await runPipeline(run, deps);

    expect(run.status).toBe('done');
    expect(run.result).toBeDefined();
    expect(deps.runSutra).toHaveBeenCalledOnce();
    expect(run.events.some((e) => e.type === 'error')).toBe(false);
  });
});
