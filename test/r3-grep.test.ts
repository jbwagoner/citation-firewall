import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

// RUBRIC R3, made machine-checkable: a model call may NEVER set status=VERIFIED.
// We grep every file that issues or shapes a model call (src/agents/* and
// src/anthropic.ts) for a quoted "VERIFIED" string literal. The only place that
// literal may appear is src/verifier.ts, which sets it from a CourtListener
// response. (The word "VERIFIED" may appear un-quoted inside prompt text — that
// is an instruction to the model, not an assignment.)
describe('RUBRIC R3 — only the verifier can assign VERIFIED', () => {
  const agentDir = join(srcDir, 'agents');
  const modelFiles = [
    ...readdirSync(agentDir).map((f) => join(agentDir, f)),
    join(srcDir, 'anthropic.ts'),
  ];

  it('no model-call file contains a quoted VERIFIED status literal', () => {
    const offenders: string[] = [];
    for (const file of modelFiles) {
      const src = readFileSync(file, 'utf8');
      if (/['"]VERIFIED['"]/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the verifier IS the one place that assigns VERIFIED (positive control)', () => {
    const verifier = readFileSync(join(srcDir, 'verifier.ts'), 'utf8');
    expect(/'VERIFIED'/.test(verifier)).toBe(true);
  });
});
