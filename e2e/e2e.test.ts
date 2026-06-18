import { describe, it, expect } from 'vitest';
import { createRun } from '../src/run.js';
import { runPipeline } from '../src/pipeline.js';
import { parseCitation } from '../src/citeParser.js';
import {
  DEMO_BRIEF,
  REAL_CITES,
  MISMATCH_NAME_TOKEN,
  FLAGGED_NAME_TOKEN,
} from '../demo/sampleBrief.js';

// LIVE pipeline test (done-gate 2). Runs the demo brief through the real
// Anthropic + CourtListener stack and asserts RUBRIC R1 + R2.
// Requires ANTHROPIC_API_KEY and COURTLISTENER_TOKEN in the environment.

describe('e2e: demo brief through the live pipeline', () => {
  it(
    'completes < 90s with no errors; fabricated cite FLAGGED, real cites VERIFIED with links',
    async () => {
      const run = createRun(DEMO_BRIEF);
      const start = Date.now();
      await runPipeline(run);
      const elapsed = Date.now() - start;

      // ---- R1: end-to-end, no errors, under 90s ----
      expect(run.status).toBe('done');
      expect(run.result).toBeDefined();
      expect(elapsed).toBeLessThan(90_000);

      const ledger = run.result!.ledger;
      const byCite = (cite: string) => {
        const norm = parseCitation(cite).normalizedCite;
        return ledger.find((e) => e.normalizedCite === norm);
      };

      // ---- R2: the planted fabrication (no opinion anywhere) is FLAGGED ----
      const flaggedFake = ledger.find((e) =>
        (e.caseName ?? e.raw).includes(FLAGGED_NAME_TOKEN),
      );
      expect(flaggedFake, 'flagged fabrication must be extracted').toBeDefined();
      expect(flaggedFake!.status).toBe('FLAGGED');
      expect(flaggedFake!.note.toLowerCase()).toMatch(/no matching opinion/);

      // ---- second failure mode: a cite that resolves to a DIFFERENT real case ----
      const mismatch = ledger.find((e) =>
        (e.caseName ?? e.raw).includes(MISMATCH_NAME_TOKEN),
      );
      expect(mismatch, 'mismatch cite must be extracted').toBeDefined();
      expect(mismatch!.status).toBe('CITE_MISMATCH');
      expect(mismatch!.status).not.toBe('VERIFIED');

      // ---- R2: every real demo cite is VERIFIED with a working CourtListener link ----
      for (const real of REAL_CITES) {
        const entry = byCite(real);
        expect(entry, `real cite must be extracted: ${real}`).toBeDefined();
        expect(entry!.status, `must be VERIFIED: ${real}`).toBe('VERIFIED');
        expect(entry!.url, `must link to CourtListener: ${real}`).toMatch(
          /courtlistener\.com\/opinion/,
        );
      }

      // ---- R7 spot-check: reliance on the flagged authority is a weakness ----
      expect(
        run.result!.weaknesses.some((w) => w.severity === 5),
        'flagged authority should surface as a severity-5 weakness',
      ).toBe(true);
    },
    100_000,
  );
});
