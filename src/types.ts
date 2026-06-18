// Shared types for Citation Firewall.

/**
 * Citation verdict. These are the ONLY four states a citation can hold.
 *
 * INVARIANT (RUBRIC R3): `VERIFIED` is assigned exclusively inside src/verifier.ts,
 * and only from a live CourtListener response. No model call — anywhere in
 * src/agents/ or src/anthropic.ts — ever sets `status: 'VERIFIED'`. This is
 * grep-checkable; see test/r3-grep.test.ts.
 */
export type CitationStatus =
  | 'VERIFIED' // a real opinion exists at this reporter cite AND the case name substantially matches
  | 'HIGH_CONFIDENCE' // the case name was found, but not at the cited reporter location
  | 'CITE_MISMATCH' // the cite resolves to a real opinion, but a DIFFERENT case than the one named
  | 'UNVERIFIED' // unparseable cite, or CourtListener was unreachable (database unavailable)
  | 'FLAGGED'; // no match found in CourtListener — verify manually (may be fabricated, unpublished, recent, or in an uncovered reporter)

export interface ParsedCitation {
  raw: string; // the citation string as extracted from the brief
  caseName: string | null; // "Bell Atlantic Corp. v. Twombly"
  volume: string | null;
  reporter: string | null; // "U.S.", "F.3d", ...
  page: string | null;
  normalizedCite: string | null; // "550 U.S. 544" — cache key + lookup query
}

export interface LedgerEntry {
  raw: string;
  caseName: string | null;
  normalizedCite: string | null;
  status: CitationStatus;
  note: string; // human-readable verdict explanation
  url: string | null; // link to the real CourtListener opinion (VERIFIED / HIGH_CONFIDENCE)
  actualCaseName?: string | null; // what the cite actually resolves to, when it differs
  latencyMs: number; // round-trip time to CourtListener (proves it's real)
}

// ---- Agent output shapes (validated by zod schemas in src/schemas.ts) ----

export interface ExtractOutput {
  argumentsList: { heading: string; passage: string }[];
  citations: string[];
}

export interface OpposingCounselOutput {
  attacks: {
    target: string; // which argument this attacks
    passage: string; // a verbatim quote from the brief that the attack targets
    attack: string;
    type: 'weak_facts' | 'adverse_authority' | 'procedural';
  }[];
}

export interface StrategistOutput {
  repairs: { weakness: string; repair: string }[];
  strongestTheory: string;
}

export interface RiskAssessorOutput {
  weaknesses: {
    title: string;
    severity: 1 | 2 | 3 | 4 | 5;
    rationale: string;
    survivable: boolean;
  }[];
}

export interface SutraOutput {
  synthesis: string;
  weaknesses: { title: string; severity: number; passage: string; repair: string }[];
  nextSteps: string[];
}

export interface Report {
  synthesis: string;
  weaknesses: { title: string; severity: number; passage: string; repair: string }[];
  nextSteps: string[];
  ledger: LedgerEntry[];
}
