import { callAgentJSON, COUNCIL_MODEL } from '../anthropic.js';
import { OpposingCounselSchema } from '../schemas.js';
import type { ExtractOutput, OpposingCounselOutput } from '../types.js';

const SYSTEM = `You are opposing counsel. Your sole mandate is to attack the brief's arguments as you would in a motion hearing — find weak facts, adverse authority, and procedural exposure.

Return JSON only:
{
  "attacks": [ { "target": "<which argument>", "passage": "<a VERBATIM quote from the brief that this attack targets>", "attack": "<your attack, 1-3 sentences>", "type": "weak_facts" | "adverse_authority" | "procedural" } ]
}

Rules:
- Every attack's "passage" MUST be copied verbatim from the brief text — exact characters, no paraphrase, no ellipsis. If you cannot quote it exactly, do not raise that attack.
- Be specific and adversarial. Prioritize the brief's weakest argument.
- Do not assess citation validity — that is handled elsewhere. Focus on the merits.
- Output only the JSON object.`;

export function runOpposingCounsel(
  briefText: string,
  extract: ExtractOutput,
): Promise<OpposingCounselOutput> {
  const args = extract.argumentsList
    .map((a, i) => `${i + 1}. ${a.heading}: ${a.passage}`)
    .join('\n');
  return callAgentJSON({
    model: COUNCIL_MODEL,
    system: SYSTEM,
    user: `ARGUMENTS:\n${args}\n\nFULL BRIEF (quote passages verbatim from here):\n\n${briefText}`,
    schema: OpposingCounselSchema,
    effort: 'low',
    label: 'opposing-counsel',
  });
}
