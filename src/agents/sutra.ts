import { callAgentJSON, SUTRA_MODEL } from '../anthropic.js';
import { SutraSchema } from '../schemas.js';
import type {
  LedgerEntry,
  OpposingCounselOutput,
  RiskAssessorOutput,
  StrategistOutput,
  SutraOutput,
} from '../types.js';

// The verdict word appears in this prompt only as plain prose instructing the
// model — never as a status assignment. Sutra reconciles; it does not
// adjudicate citations. (See test/r3-grep for the machine check of RUBRIC R3.)
const SYSTEM = `You are Sutra, the synthesizing partner. You reconcile the adversarial council's findings with a citation ledger that has ALREADY been checked against CourtListener's live database. You produce the final report the lawyer reads before filing.

Return JSON only:
{
  "synthesis": "<2-4 sentences: the honest bottom line on this brief's readiness to file>",
  "weaknesses": [ { "title": "<short>", "severity": 1-5, "passage": "<a verbatim quote from the brief this weakness concerns, or '' if none>", "repair": "<concrete fix>" } ],
  "nextSteps": [ "<imperative action>" ]
}

Hard rules:
- You may rely ONLY on authorities the ledger marks VERIFIED. You are forbidden from treating any FLAGGED, CITE_MISMATCH, or UNVERIFIED authority as good law. A CITE_MISMATCH means the citation resolves to a DIFFERENT case than the one named — never treat it as the cited authority.
- If the brief relies on a FLAGGED, CITE_MISMATCH, or UNVERIFIED authority, that reliance is itself a weakness — list it with high severity and a repair that says to remove, replace, or confirm the citation before filing.
- Sort weaknesses by severity, highest first.
- Output only the JSON object.`;

export function runSutra(
  briefText: string,
  council: {
    opposing: OpposingCounselOutput;
    strategist: StrategistOutput;
    risk: RiskAssessorOutput;
  },
  ledger: LedgerEntry[],
): Promise<SutraOutput> {
  const ledgerText = ledger
    .map(
      (e) =>
        `- [${e.status}] ${e.caseName ?? e.raw} (${e.normalizedCite ?? 'no cite'}): ${e.note}`,
    )
    .join('\n');

  const user = `BRIEF:\n${briefText}\n
COUNCIL — OPPOSING COUNSEL ATTACKS:\n${JSON.stringify(council.opposing.attacks, null, 2)}\n
COUNCIL — STRATEGIST:\n${JSON.stringify(council.strategist, null, 2)}\n
COUNCIL — RISK ASSESSOR:\n${JSON.stringify(council.risk.weaknesses, null, 2)}\n
CITATION LEDGER (database-checked verdicts — trust these, not your own memory):\n${ledgerText}`;

  return callAgentJSON({
    model: SUTRA_MODEL,
    system: SYSTEM,
    user,
    schema: SutraSchema,
    effort: 'medium',
    label: 'sutra',
  });
}
