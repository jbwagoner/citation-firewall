import { callAgentJSON, COUNCIL_MODEL } from '../anthropic.js';
import { RiskAssessorSchema } from '../schemas.js';
import type { ExtractOutput, RiskAssessorOutput } from '../types.js';

const SYSTEM = `You are a litigation risk assessor. Score the brief's weaknesses by severity and explain what makes each survivable or fatal.

Return JSON only:
{
  "weaknesses": [ { "title": "<short label>", "severity": 1 | 2 | 3 | 4 | 5, "rationale": "<what drives the score; what makes it survivable or fatal>", "survivable": true | false } ]
}

Severity scale: 1 = cosmetic, 3 = real exposure, 5 = case-dispositive / sanctionable.

Rules:
- Severity MUST be an integer 1 through 5.
- A weak factual record or an unsupported legal standard should score higher than a stylistic issue.
- Output only the JSON object.`;

export function runRiskAssessor(
  briefText: string,
  extract: ExtractOutput,
): Promise<RiskAssessorOutput> {
  const args = extract.argumentsList
    .map((a, i) => `${i + 1}. ${a.heading}: ${a.passage}`)
    .join('\n');
  return callAgentJSON({
    model: COUNCIL_MODEL,
    system: SYSTEM,
    user: `ARGUMENTS:\n${args}\n\nFULL BRIEF:\n\n${briefText}`,
    schema: RiskAssessorSchema,
    effort: 'low',
    label: 'risk-assessor',
  });
}
