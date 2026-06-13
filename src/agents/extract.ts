import { callAgentJSON, COUNCIL_MODEL } from '../anthropic.js';
import { ExtractSchema } from '../schemas.js';
import type { ExtractOutput } from '../types.js';

const SYSTEM = `You are a legal intake analyst. Read a draft litigation brief and extract its structure as JSON only — no prose, no markdown.

Return exactly:
{
  "argumentsList": [ { "heading": "<short label for the argument>", "passage": "<a verbatim sentence or two from the brief stating this argument>" } ],
  "citations": [ "<each case citation exactly as it appears, e.g. 'Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)'>" ]
}

Rules:
- Every "passage" must be copied verbatim from the brief — do not paraphrase.
- Capture EVERY case citation you see, including any that look suspicious. Copy the full string (case name + reporter cite + year). Never invent or "correct" a citation.
- Identify 2–5 distinct legal arguments.
- Output only the JSON object.`;

export function runExtract(briefText: string): Promise<ExtractOutput> {
  return callAgentJSON({
    model: COUNCIL_MODEL,
    system: SYSTEM,
    user: `BRIEF:\n\n${briefText}`,
    schema: ExtractSchema,
    effort: 'low',
    label: 'extract',
  });
}
