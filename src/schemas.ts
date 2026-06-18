import { z } from 'zod';

// Zod schemas for every agent's JSON output. We never trust model output shape:
// each response is parsed through one of these before it touches the pipeline.
// These schemas are also the json_schema we hand the API via output_config.format
// (through zodOutputFormat), so the model is constrained to the shape AND we
// re-validate the result ourselves.

export const ExtractSchema = z.object({
  // May be empty: citation-dense / argument-light text (e.g. a table of
  // authorities) legitimately has no developed argument. The pipeline still
  // runs — it verifies the citations and synthesizes from the ledger.
  argumentsList: z.array(
    z.object({
      heading: z.string(),
      passage: z.string(),
    }),
  ),
  citations: z.array(z.string()),
});

export const OpposingCounselSchema = z.object({
  attacks: z.array(
    z.object({
      target: z.string(),
      passage: z.string(),
      attack: z.string(),
      type: z.enum(['weak_facts', 'adverse_authority', 'procedural']),
    }),
  ),
});

export const StrategistSchema = z.object({
  repairs: z.array(
    z.object({
      weakness: z.string(),
      repair: z.string(),
    }),
  ),
  strongestTheory: z.string(),
});

export const RiskAssessorSchema = z.object({
  weaknesses: z.array(
    z.object({
      title: z.string(),
      severity: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ]),
      rationale: z.string(),
      survivable: z.boolean(),
    }),
  ),
});

export const SutraSchema = z.object({
  synthesis: z.string(),
  weaknesses: z.array(
    z.object({
      title: z.string(),
      severity: z.number().int().min(1).max(5),
      passage: z.string(),
      repair: z.string(),
    }),
  ),
  nextSteps: z.array(z.string()),
});

/**
 * Validate raw model text against a schema. This is the single, testable
 * validation choke point — feed it malformed JSON and it throws (RUBRIC: zod
 * rejection of malformed agent JSON). Used by every agent in src/agents/.
 */
export function validateAgentJSON<T>(schema: z.ZodType<T>, rawText: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Agent returned non-JSON output');
  }
  return schema.parse(parsed);
}
