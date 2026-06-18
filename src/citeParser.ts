import type { ParsedCitation } from './types.js';

// ============================================================================
//  Citation parser — resilient to PDF-paste formatting.
//
//  Real users paste briefs out of a PDF, which mangles whitespace: line breaks
//  land mid-citation, parallel cites jam together, spaces collapse. So we:
//    1. NORMALIZE whitespace (incl. newlines) before parsing — reassembles
//       citations split across lines.
//    2. Anchor on the REPORTER (a known list + a structural fallback), not on
//       the year parenthetical. This extracts the official cite ("393 U.S. 503")
//       even when parallel cites and pincites follow, and never produces a
//       garbage cite by swallowing jammed tokens.
//    3. Collapse PARALLEL cites (same case, multiple reporters) to the first /
//       official one, so an authority gets a single clean ledger row.
// ============================================================================

/** Collapse PDF-paste whitespace (NBSP, tabs, newlines, …) to single spaces. */
export function normalizeForCites(s: string): string {
  return s
    .replace(/[\u200b\ufeff]/g, '') // zero-width space / BOM
    .replace(/\s+/g, ' ') // all whitespace (incl. NBSP, tabs, newlines) -> single space
    .trim();
}

// Known reporter abbreviations → canonical form CourtListener keys on. The match
// patterns are tolerant of spacing/periods ("S.Ct." ≡ "S. Ct."); the canonical
// form is recovered from a normalized key (letters+digits only, lowercased).
const REPORTER_CANON: Record<string, string> = {
  us: 'U.S.',
  sct: 'S. Ct.',
  led: 'L. Ed.',
  led2d: 'L. Ed. 2d',
  f: 'F.',
  f2d: 'F.2d',
  f3d: 'F.3d',
  f4th: 'F.4th',
  fsupp: 'F. Supp.',
  fsupp2d: 'F. Supp. 2d',
  fsupp3d: 'F. Supp. 3d',
  fappx: "F. App'x",
  fedappx: "F. App'x",
  br: 'B.R.',
  a: 'A.',
  a2d: 'A.2d',
  a3d: 'A.3d',
  p: 'P.',
  p2d: 'P.2d',
  p3d: 'P.3d',
  ne: 'N.E.',
  ne2d: 'N.E.2d',
  ne3d: 'N.E.3d',
  nw: 'N.W.',
  nw2d: 'N.W.2d',
  se: 'S.E.',
  se2d: 'S.E.2d',
  sw: 'S.W.',
  sw2d: 'S.W.2d',
  sw3d: 'S.W.3d',
  so: 'So.',
  so2d: 'So.2d',
  so3d: 'So.3d',
};

function reporterKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Reporter match alternation, ordered specific→general so "F. Supp. 2d" wins
// over "F.". Each alternative tolerates optional spaces and periods.
const REPORTER_ALT = [
  "U\\.?\\s?S\\.?",
  "S\\.?\\s?Ct\\.?",
  "L\\.?\\s?Ed\\.?\\s?2d",
  "L\\.?\\s?Ed\\.?",
  "F\\.?\\s?Supp\\.?\\s?3d",
  "F\\.?\\s?Supp\\.?\\s?2d",
  "F\\.?\\s?Supp\\.?",
  "Fed\\.?\\s?App\\.?\\s?'?x",
  "F\\.?\\s?App\\.?\\s?'?x",
  "F\\.?\\s?4th",
  "F\\.?\\s?3d",
  "F\\.?\\s?2d",
  "F\\.",
  "B\\.?\\s?R\\.?",
  "N\\.?\\s?E\\.?\\s?[23]d",
  "N\\.?\\s?E\\.?",
  "N\\.?\\s?W\\.?\\s?2d",
  "N\\.?\\s?W\\.?",
  "S\\.?\\s?E\\.?\\s?2d",
  "S\\.?\\s?E\\.?",
  "S\\.?\\s?W\\.?\\s?[23]d",
  "S\\.?\\s?W\\.?",
  "A\\.?\\s?[23]d",
  "A\\.",
  "P\\.?\\s?[23]d",
  "P\\.",
  "So\\.?\\s?[23]d",
  "So\\.",
].join('|');

// Primary: a number, a KNOWN reporter, a number. Lookarounds keep us off the
// middle of a longer number.
const KNOWN_CITE_RE = new RegExp(`(?<!\\d)(\\d{1,4})\\s+(${REPORTER_ALT})\\s+(\\d{1,5})(?!\\d)`, 'g');

// Structural fallback for reporters not in the list: the reporter must be made
// of capitalized abbreviation tokens (each ending in a period) plus an optional
// series suffix — so it can't match prose and can't swallow a bare number.
const FALLBACK_CITE_RE =
  /(?<!\d)(\d{1,4})\s+((?:[A-Z][A-Za-z]*\.\s?){1,4}(?:[234](?:d|th)\b)?)\s+(\d{1,5})(?!\d)/g;

interface RawMatch {
  index: number;
  end: number;
  vol: string;
  reporter: string;
  page: string;
}

function findRawMatches(norm: string): RawMatch[] {
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && ts < e);
  const found: RawMatch[] = [];

  const run = (re: RegExp, canonize: (r: string) => string | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm)) !== null) {
      const reporter = canonize(m[2]);
      if (!reporter) continue;
      const s = m.index;
      const e = m.index + m[0].length;
      if (overlaps(s, e)) continue;
      taken.push([s, e]);
      found.push({ index: s, end: e, vol: m[1], reporter, page: m[3] });
    }
  };

  run(KNOWN_CITE_RE, (r) => REPORTER_CANON[reporterKey(r)] ?? null);
  run(FALLBACK_CITE_RE, (r) => r.replace(/\s+/g, ' ').trim());

  return found.sort((a, b) => a.index - b.index);
}

// The gap between two cites is a "parallel" connector (same case) when it holds
// only separators / an optional pincite / "and" — no new case name.
function isParallelGap(gap: string): boolean {
  return /^[\s,;:&]*(?:at\s+\d+(?:[-–]\d+)?\s*)?(?:and\s+|&\s+)?[\s,;:]*$/i.test(gap);
}

/**
 * Find every authority in a string. Parallel cites for one case collapse to the
 * first (official) reporter. Each authority's case name is the text since the
 * previous authority.
 */
export function parseCitations(text: string): ParsedCitation[] {
  const norm = normalizeForCites(text);
  const matches = findRawMatches(norm);
  if (matches.length === 0) return [];

  const out: ParsedCitation[] = [];
  let nameFrom = 0;
  let i = 0;
  while (i < matches.length) {
    const first = matches[i];
    let last = first;
    let j = i + 1;
    while (j < matches.length && isParallelGap(norm.slice(last.end, matches[j].index))) {
      last = matches[j];
      j += 1;
    }
    const caseName = cleanName(norm.slice(nameFrom, first.index)) || null;
    const segment = norm.slice(nameFrom, last.end).replace(/^[\s;,]+/, '').trim();
    out.push({
      raw: segment || `${first.vol} ${first.reporter} ${first.page}`,
      caseName,
      volume: first.vol,
      reporter: first.reporter,
      page: first.page,
      normalizedCite: `${first.vol} ${first.reporter} ${first.page}`,
    });
    nameFrom = last.end;
    i = j;
  }
  return out;
}

/** Parse the FIRST citation in a string (back-compat / single use). */
export function parseCitation(raw: string): ParsedCitation {
  const all = parseCitations(raw);
  if (all.length > 0) return all[0];
  const text = normalizeForCites(raw);
  return {
    raw: text,
    caseName: cleanName(text) || null,
    volume: null,
    reporter: null,
    page: null,
    normalizedCite: null,
  };
}

// ---- case-name handling ----

const SIGNAL_RE =
  /^(?:see also|see generally|see, e\.g\.,|see|cf\.|accord|but see|but cf\.|compare|contra|e\.g\.,|quoting|citing|rev'd|aff'd|cert\. denied)\s+/i;
const DOCKET_RE = /,?\s*No\.\s*[\dA-Za-z–-]+/g;

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
  let t = normalizeForCites(s);
  // Strip leading debris from a prior parallel/string cite: optional pincite
  // digits + a "(…year…)" parenthetical + punctuation (e.g. "322 (1986); ").
  t = t.replace(/^[\s.,;:]*\d*\s*\([^)]*\b\d{4}\b[^)]*\)[\s.,;:]*/, '');
  t = t.replace(/^[\s).,;:]+/, ''); // leading punctuation / stray close-paren
  t = stripSignal(t).replace(DOCKET_RE, '');
  return t.replace(/[,;:\s]+$/, '').replace(/^[\s,;]+/, '').trim();
}

/**
 * Is there a real cited CASE NAME (vs a subsequent-history fragment like
 * "rev'd on other grounds")? Requires a "X v. Y" or a single-party prefix.
 * Used to avoid flagging a nameless citation fragment as a CITE_MISMATCH.
 */
export function hasCaseName(name: string | null): boolean {
  if (!name) return false;
  if (/\sv\.?\s/i.test(name)) return true;
  return /^(?:in re|ex parte|matter of|estate of)\b/i.test(name.trim());
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

/** Tokenize one chunk: ≥4-char alpha words, minus corporate/signal stopwords and pure numbers. */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)),
  );
}

/** Flat significant-token list for a whole case name. */
export function nameTokens(caseName: string | null): string[] {
  if (!caseName) return [];
  return [...tokenize(caseName.replace(/\bv\.?\b/g, ' '))];
}

/** Split a case name into plaintiff (left) / defendant (right) token sets on "v.". */
export function splitParties(name: string | null): { left: Set<string>; right: Set<string> } {
  if (!name) return { left: new Set(), right: new Set() };
  const parts = name.split(/\sv\.?\s/i);
  return { left: tokenize(parts[0] ?? ''), right: tokenize(parts.slice(1).join(' ')) };
}

type SideVerdict = 'match' | 'neutral' | 'mismatch';
function sideVerdict(a: Set<string>, b: Set<string>): SideVerdict {
  if (a.size === 0 || b.size === 0) return 'neutral';
  for (const t of a) if (b.has(t)) return 'match';
  return 'mismatch';
}

/**
 * Does `actual` refer to the SAME case as `cited`? Side-aware substantial match:
 * neither party side may be a definite mismatch and at least one must match. A
 * shared defendant alone ("v. City of Wickliffe") is NOT sufficient. Tolerates
 * abbreviations/initials (neutral) and reversed captions. This is the guarantee
 * behind VERIFIED.
 */
export function nameMatches(cited: string | null, actual: string | null): boolean {
  const c = splitParties(cited);
  const a = splitParties(actual);
  const ok = (al: Set<string>, ar: Set<string>): boolean => {
    const left = sideVerdict(c.left, al);
    const right = sideVerdict(c.right, ar);
    return left !== 'mismatch' && right !== 'mismatch' && (left === 'match' || right === 'match');
  };
  return ok(a.left, a.right) || ok(a.right, a.left);
}
