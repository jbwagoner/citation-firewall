import type { ParsedCitation } from './types.js';

// Matches a reporter citation anchored on the year parenthetical that follows it,
// e.g. "550 U.S. 544 (2007)" or "784 F.3d 412 (9th Cir. 2015)".
//   group 1: volume      "550"
//   group 2: reporter     "U.S." / "F.3d" / "F. Supp. 2d"
//   group 3: page        "544"
//   group 4: year paren  "2007" / "9th Cir. 2015"
const CITE_RE =
  /(\d+)\s+([A-Z][A-Za-z0-9.]*(?:\s+[A-Za-z0-9.]+)*?)\s+(\d+)\s*\(([^)]*\b\d{4}\b)\)/;

/**
 * Parse a single citation string into its reporter components. The case name is
 * everything before the volume number, stripped of a trailing comma.
 *
 * A model may extract and hand us these strings — but parsing here is pure code,
 * and an unparseable cite becomes UNVERIFIED (never VERIFIED). See RUBRIC R3.
 */
export function parseCitation(raw: string): ParsedCitation {
  const text = raw.trim();
  const m = CITE_RE.exec(text);
  if (!m) {
    return {
      raw: text,
      caseName: cleanName(text) || null,
      volume: null,
      reporter: null,
      page: null,
      normalizedCite: null,
    };
  }

  const [, volume, reporterRaw, page] = m;
  const reporter = reporterRaw.replace(/\s+/g, ' ').trim();
  const caseName = cleanName(text.slice(0, m.index)) || null;
  const normalizedCite = `${volume} ${reporter} ${page}`;

  return { raw: text, caseName, volume, reporter, page, normalizedCite };
}

function cleanName(s: string): string {
  return s
    .replace(/[,;:\s]+$/, '')
    .replace(/^[\s,]+/, '')
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
]);

/**
 * Extract the significant tokens (party surnames, distinctive words) from a case
 * name — used to decide whether a CourtListener result is really the cited case.
 */
export function nameTokens(caseName: string | null): string[] {
  if (!caseName) return [];
  return caseName
    .toLowerCase()
    .replace(/\bv\.?\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * Does `actual` (a CourtListener case name) plausibly refer to the same case as
 * `cited` (the name from the brief)? True when they share at least one
 * significant token. Lenient by design — a single shared party surname is a
 * strong signal, and we'd rather VERIFY a real match than over-FLAG.
 */
export function nameMatches(cited: string | null, actual: string | null): boolean {
  const a = nameTokens(cited);
  const b = new Set(nameTokens(actual));
  if (a.length === 0 || b.size === 0) return false;
  return a.some((t) => b.has(t));
}
