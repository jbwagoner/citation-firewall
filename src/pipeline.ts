import { runExtract } from './agents/extract.js';
import { runOpposingCounsel } from './agents/opposingCounsel.js';
import { runStrategist } from './agents/strategist.js';
import { runRiskAssessor } from './agents/riskAssessor.js';
import { runSutra } from './agents/sutra.js';
import { createCourtListenerClient, verifyAll, type CourtListenerClient } from './verifier.js';
import { emit, type Run } from './run.js';
import { normalizeWS, passageInBrief } from './util.js';
import type { LedgerEntry, OpposingCounselOutput, Report, SutraOutput } from './types.js';

export interface PipelineDeps {
  runExtract: typeof runExtract;
  runOpposingCounsel: typeof runOpposingCounsel;
  runStrategist: typeof runStrategist;
  runRiskAssessor: typeof runRiskAssessor;
  runSutra: typeof runSutra;
  clClient: CourtListenerClient;
}

function defaultDeps(): PipelineDeps {
  const token = process.env.COURTLISTENER_TOKEN;
  if (!token) throw new Error('COURTLISTENER_TOKEN is not set');
  return {
    runExtract,
    runOpposingCounsel,
    runStrategist,
    runRiskAssessor,
    runSutra,
    clClient: createCourtListenerClient(token),
  };
}

/**
 * The pipeline state machine. Stages run in order; `run.halted` is checked
 * BEFORE every stage (brief §4). A halt stops the pipeline before the next
 * stage begins. The verifier additionally checks halt between citations.
 */
export async function runPipeline(run: Run, depsOverride?: Partial<PipelineDeps>): Promise<void> {
  const halted = () => run.halted;

  const stopIfHalted = (): boolean => {
    if (halted()) {
      run.status = 'halted';
      emit(run, { type: 'halted' });
      return true;
    }
    return false;
  };

  try {
    // Resolve deps inside the try so a misconfiguration (e.g. missing env) is
    // reported as an error event rather than crashing the server process.
    const deps = { ...defaultDepsLazy(depsOverride), ...depsOverride } as PipelineDeps;

    // ---- Stage 0: Extract ----
    if (stopIfHalted()) return;
    emit(run, { type: 'stage', stage: 'extract', status: 'start' });
    const extract = await deps.runExtract(run.text);
    emit(run, {
      type: 'extracted',
      data: { arguments: extract.argumentsList, citations: extract.citations },
    });
    emit(run, { type: 'stage', stage: 'extract', status: 'done' });

    // ---- Stage 1: Council (parallel, independent contexts) ----
    if (stopIfHalted()) return;
    emit(run, { type: 'stage', stage: 'council', status: 'start' });
    const [opposingRaw, strategist, risk] = await Promise.all([
      deps.runOpposingCounsel(run.text, extract),
      deps.runStrategist(run.text, extract),
      deps.runRiskAssessor(run.text, extract),
    ]);

    // RUBRIC R6: keep only attacks whose quoted passage actually appears in the
    // brief. Report (don't silently drop) how many failed the check.
    const validAttacks = opposingRaw.attacks.filter((a) => passageInBrief(a.passage, run.text));
    const droppedAttacks = opposingRaw.attacks.length - validAttacks.length;
    const opposing: OpposingCounselOutput = { attacks: validAttacks };

    emit(run, {
      type: 'agent',
      agent: 'opposing',
      data: { attacks: validAttacks, dropped: droppedAttacks },
    });
    emit(run, { type: 'agent', agent: 'strategist', data: strategist });
    emit(run, { type: 'agent', agent: 'risk', data: risk });
    emit(run, { type: 'stage', stage: 'council', status: 'done' });

    // ---- Stage 2: Verifier (CODE, not a model verdict) ----
    if (stopIfHalted()) return;
    emit(run, { type: 'stage', stage: 'verify', status: 'start' });
    const verifyStart = Date.now();
    const ledger = await verifyAll(
      extract.citations,
      deps.clClient,
      (entry) => emit(run, { type: 'citation', data: entry }),
      halted,
    );
    emit(run, {
      type: 'stage',
      stage: 'verify',
      status: 'done',
      lookupMs: Date.now() - verifyStart,
    });

    // ---- Stage 3: Sutra synthesis ----
    if (stopIfHalted()) return;
    emit(run, { type: 'stage', stage: 'sutra', status: 'start' });
    const sutra = await deps.runSutra(run.text, { opposing, strategist, risk }, ledger);
    const report = buildReport(sutra, ledger);
    emit(run, { type: 'report', data: report });
    emit(run, { type: 'stage', stage: 'sutra', status: 'done' });

    run.result = report;
    run.status = 'done';
    emit(run, { type: 'done' });
  } catch (err) {
    if (run.halted) {
      run.status = 'halted';
      emit(run, { type: 'halted' });
      return;
    }
    run.status = 'error';
    run.error = err instanceof Error ? err.message : String(err);
    emit(run, { type: 'error', message: run.error });
  }
}

// Only construct the real (token-requiring) deps if the caller didn't supply
// everything — keeps unit tests free of env requirements.
function defaultDepsLazy(override?: Partial<PipelineDeps>): PipelineDeps {
  const needsReal =
    !override ||
    !override.runExtract ||
    !override.runOpposingCounsel ||
    !override.runStrategist ||
    !override.runRiskAssessor ||
    !override.runSutra ||
    !override.clClient;
  return needsReal ? defaultDeps() : (override as PipelineDeps);
}

/**
 * Assemble the final report. Guarantees RUBRIC R7:
 *   - every FLAGGED / UNVERIFIED authority becomes a high-severity weakness
 *     (reliance on flagged authority is itself a weakness), and
 *   - weaknesses are sorted by severity, highest first.
 * Sutra is the analytical author; this code is the guarantee.
 */
export function buildReport(sutra: SutraOutput, ledger: LedgerEntry[]): Report {
  const problematic = ledger.filter(
    (e) =>
      e.status === 'FLAGGED' ||
      e.status === 'CITE_MISMATCH' ||
      e.status === 'UNVERIFIED',
  );

  const severityFor = (s: string): number =>
    s === 'FLAGGED' ? 5 : s === 'CITE_MISMATCH' ? 4 : 3;

  const injected = problematic.map((e) => ({
    title: `Reliance on unverifiable authority: ${e.caseName ?? e.raw}`,
    severity: severityFor(e.status),
    passage: e.raw,
    repair: `${e.note} Remove or replace this citation before filing.`,
  }));

  // Drop any Sutra weakness that duplicates an injected one (mentions the same
  // case name or cite), so each problematic authority appears exactly once.
  const names = problematic.map((e) => normalizeWS(e.caseName ?? '')).filter(Boolean);
  const cites = problematic.map((e) => normalizeWS(e.normalizedCite ?? '')).filter(Boolean);
  const sutraFiltered = sutra.weaknesses.filter((w) => {
    const text = normalizeWS(`${w.title} ${w.passage} ${w.repair}`);
    return !names.some((n) => text.includes(n)) && !cites.some((c) => text.includes(c));
  });

  const weaknesses = [...injected, ...sutraFiltered].sort((a, b) => b.severity - a.severity);
  return { synthesis: sutra.synthesis, weaknesses, nextSteps: sutra.nextSteps, ledger };
}
