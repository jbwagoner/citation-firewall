import type { ParsedCitation } from './types.js';

// Matches a reporter citation, anchored on the year parenthetical that follows
// it, and TOLERATING real-world brief formatting:
//   "550 U.S. 544 (2007)"                         (clean)
//   "477 U.S. 57, 64 (1986)"                       (pincite after first page)
//   "477 U.S. 242, 248-49 (1986)"                  (pincite range)
//   "410 F. Supp. 2d 552, 558 (S.D.N.Y. 2006)"     (multi-word reporter + pincite)
//   group 1: volume   group 2: reporter   group 3: page   group 4: year paren
//
// The `(?:\s*,\s*\d+(?:[-–]\d+)?)*` after the page consumes one or more pincites
// (the single most common reason real citations failed to parse). Reporter is
// lazy so it stops at the page; pincites are discarded — only vol/reporter/page
// feed the lookup, which is exactly the key CourtListener returns.
const CITE_SOURCE =
  '(\\d+)\\s+([A-Z][A-Za-z0-9.]*(?:\\s+[A-Za-z0-9.]+)*?)\\s+(\\d+)(?:\\s*,\\s*\\d+(?:[-–]\\d+)?)*\\s*\\(([^)]*\\b\\d{4}\\b)\\)';

// Leading Bluebook signals to strip from a case name ("see also Anderson…").
const SIGNAL_RE =
  /^(?:see also|see generally|see, e\.g\.,|see|cf\.|accord|but see|but cf\.|compare|contra|e\.g\.,)\s+/i;

// Docket numbers embedded in (or before) a case name: "No. 02-516", "No. 21-1199".
const DOCKET_RE = /,?\s*No\.\s*[\dA-Za-z–-]+/g;

/**
 * Parse a single citation string into its reporter components. Returns the FIRST
 * citation found (back-compat); for string cites use {@link parseCitations}.
 * Unparseable → null cite (which the verifier treats as UNVERIFIED, never VERIFIED).
 */
export function parseCitation(raw: string): ParsedCitation {
  const all = parseCitations(raw);
  if (all.length > 0) return all[0];
  const text = raw.trim();
  return {
    raw: text,
    caseName: cleanName(text) || null,
    volume: null,
    reporter: null,
    page: null,
    normalizedCite: null,
  };
}

/**
 * Find EVERY citation in a string. A single brief reference is often a string
 * cite — "Celotex…, 477 U.S. 317 (1986); Matsushita…, 475 U.S. 574 (1986)" — and
 * each cited authority must get its own ledger verdict. The case name for each
 * cite is the text since the previous cite, with signals/dockets stripped.
 */
export function parseCitations(text: string): ParsedCitation[] {
  const re = new RegExp(CITE_SOURCE, 'g');
  const out: ParsedCitation[] = [];
  let m: RegExpExecArray | null;
  let lastEnd = 0;

  while ((m = re.exec(text)) !== null) {
    const [full, volume, reporterRaw, page] = m;
    const reporter = reporterRaw.replace(/\s+/g, ' ').trim();
    const caseName = cleanName(text.slice(lastEnd, m.index)) || null;
    const segment = text.slice(lastEnd, m.index + full.length);
    const displayRaw = stripSignal(segment.replace(/^[\s;,]+/, '')).trim() || full.trim();
    out.push({
      raw: displayRaw,
      caseName,
      volume,
      reporter,
      page,
      normalizedCite: `${volume} ${reporter} ${page}`,
    });
    lastEnd = m.index + full.length;
  }
  return out;
}

function stripSignal(s: string): string {
  let prev: string;
  let cur = s.trim();
  do {
    prev = cur;
    cur = cur.replace(SIGNAL_RE, '').trim();
  } while (cur !== prev);
  return cur;
}

function cleanName(s: string): string {
  return stripSignal(s)
    .replace(DOCKET_RE, '')
    .replace(/[,;:\s]+$/, '')
    .replace(/^[\s,;]+/, '')
    .trim();
}

const STOP_WORDS = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'the',
  'and',
  'of',
  'in',
  'group',
  'holdings',
  'brands',
  'industries',
  'see',
  'also',
  'cf',
  'accord',
]);

/** Tokenize one chunk of a case name: ≥4-char words, minus corporate/signal stopwords. */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
  );
}

/**
 * Extract the significant tokens from a whole case name (both parties). Kept for
 * callers/tests that want a flat token list.
 */
export function nameTokens(caseName: string | null): string[] {
  if (!caseName) return [];
  return [...tokenize(caseName.replace(/\bv\.?\b/g, ' '))];
}

/** Split a case name into plaintiff (left) / defendant (right) token sets on "v.". */
export function splitParties(name: string | null): { left: Set<string>; right: Set<string> } {
  if (!name) return { left: new Set(), right: new Set() };
  const parts = name.split(/\sv\.?\s/i);
  const left = tokenize(parts[0] ?? '');
  const right = tokenize(parts.slice(1).join(' '));
  return { left, right };
}

type SideVerdict = 'match' | 'neutral' | 'mismatch';

function sideVerdict(a: Set<string>, b: Set<string>): SideVerdict {
  if (a.size === 0 || b.size === 0) return 'neutral'; // initials / no distinctive tokens
  for (const t of a) if (b.has(t)) return 'match';
  return 'mismatch';
}

/**
 * Does `actual` (a CourtListener case name) refer to the SAME case as `cited`?
 *
 * A case name is `Plaintiff v. Defendant`. We compare the parties side-by-side
 * and require a SUBSTANTIAL match: neither side may be a definite mismatch, and
 * at least one side must positively match. A shared defendant alone (common in
 * "v. City of X" / "v. County" suits) is NOT sufficient — the plaintiff side
 * must also correspond. Abbreviation/initials differences are tolerated as
 * "neutral" (e.g. "Dist." vs "District", "M.A.L." vs "M.A.L. Ex Rel. M.L.").
 * The reversed caption (appeals flip the parties) is also accepted.
 *
 * This is the guarantee behind VERIFIED: "Miller v. City of Wickliffe" must NOT
 * verify against "Mosley v. City of Wickliffe" on the shared city alone.
 */
export function nameMatches(cited: string | null, actual: string | null): boolean {
  const c = splitParties(cited);
  const a = splitParties(actual);

  const orientationOk = (al: Set<string>, ar: Set<string>): boolean => {
    const left = sideVerdict(c.left, al);
    const right = sideVerdict(c.right, ar);
    return left !== 'mismatch' && right !== 'mismatch' && (left === 'match' || right === 'match');
  };

  return orientationOk(a.left, a.right) || orientationOk(a.right, a.left);
}
