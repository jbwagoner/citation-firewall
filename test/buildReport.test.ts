import { describe, it, expect } from 'vitest';
import { buildReport } from '../src/pipeline.js';
import type { LedgerEntry, SutraOutput } from '../src/types.js';

describe('buildReport guarantees RUBRIC R7', () => {
  const flaggedLedger: LedgerEntry[] = [
    {
      raw: 'Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015)',
      caseName: 'Sunhaven Brands, LLC v. Meridian Apparel Co.',
      normalizedCite: '784 F.3d 412',
      status: 'FLAGGED',
      note: 'No matching opinion found in any reporter.',
      url: null,
      latencyMs: 42,
    },
  ];

  it('reliance on a FLAGGED authority is itself a severity-5 weakness', () => {
    const sutra: SutraOutput = {
      synthesis: 'ok',
      weaknesses: [{ title: 'minor stylistic issue', severity: 2, passage: '', repair: 'tidy' }],
      nextSteps: ['file'],
    };
    const report = buildReport(sutra, flaggedLedger);
    const flaggedWeakness = report.weaknesses.find((w) => /Sunhaven/.test(w.title));
    expect(flaggedWeakness).toBeDefined();
    expect(flaggedWeakness!.severity).toBe(5);
  });

  it('weaknesses are sorted by severity, highest first', () => {
    const sutra: SutraOutput = {
      synthesis: 'ok',
      weaknesses: [
        { title: 'low', severity: 1, passage: '', repair: 'x' },
        { title: 'mid', severity: 3, passage: '', repair: 'y' },
      ],
      nextSteps: [],
    };
    const report = buildReport(sutra, flaggedLedger);
    for (let i = 1; i < report.weaknesses.length; i++) {
      expect(report.weaknesses[i - 1].severity).toBeGreaterThanOrEqual(
        report.weaknesses[i].severity,
      );
    }
  });
});
