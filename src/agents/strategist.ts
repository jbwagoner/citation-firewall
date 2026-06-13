import { callAgentJSON, COUNCIL_MODEL } from '../anthropic.js';
import { StrategistSchema } from '../schemas.js';
import type { ExtractOutput, StrategistOutput } from '../types.js';

const SYSTEM = `You are a case strategist for the filing party. Your mandate is constructive: given the brief's arguments, propose concrete repairs and name the strongest surviving theory of the case.

Return JSON only:
{
  "repairs": [ { "weakness": "<a vulnerability in the brief>", "repair": "<a concrete fix: better authority, reframed fact, narrower ask>" } ],
  "strongestTheory": "<one paragraph: the most defensible theory to lead with>"
}

Rules:
- Be practical and specific — repairs a litigator could action this week.
- Do not rely on any specific case citation being valid; reason from doctrine and facts.
- Output only the JSON object.`;

export function runStrategist(
  briefText: string,
  extract: ExtractOutput,
): Promise<StrategistOutput> {
  const args = extract.argumentsList
    .map((a, i) => `${i + 1}. ${a.heading}: ${a.passage}`)
    .join('\n');
  return callAgentJSON({
    model: COUNCIL_MODEL,
    system: SYSTEM,
    user: `ARGUMENTS:\n${args}\n\nFULL BRIEF:\n\n${briefText}`,
    schema: StrategistSchema,
    effort: 'low',
    label: 'strategist',
  });
}
