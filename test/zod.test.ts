import { describe, it, expect } from 'vitest';
import { validateAgentJSON, ExtractSchema, RiskAssessorSchema } from '../src/schemas.js';

describe('zod rejection of malformed agent JSON', () => {
  it('rejects non-JSON output', () => {
    expect(() => validateAgentJSON(ExtractSchema, 'I think the answer is...')).toThrow();
  });

  it('rejects JSON of the wrong shape', () => {
    expect(() => validateAgentJSON(ExtractSchema, '{"unexpected": true}')).toThrow();
  });

  it('rejects an out-of-range severity', () => {
    const bad = JSON.stringify({
      weaknesses: [{ title: 't', severity: 9, rationale: 'r', survivable: true }],
    });
    expect(() => validateAgentJSON(RiskAssessorSchema, bad)).toThrow();
  });

  it('accepts a well-formed response', () => {
    const ok = JSON.stringify({
      argumentsList: [{ heading: 'h', passage: 'p' }],
      citations: ['Foo v. Bar, 1 U.S. 1 (1900)'],
    });
    const out = validateAgentJSON(ExtractSchema, ok);
    expect(out.citations).toEqual(['Foo v. Bar, 1 U.S. 1 (1900)']);
  });
});
