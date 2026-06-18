import {
  parseCitation,
  parseCitations,
  nameMatches,
  hasCaseName,
  normalizeForCites,
} from './citeParser.js';
import type { CitationStatus, LedgerEntry, ParsedCitation } from './types.js';

// ============================================================================
//  THE HEART OF CITATION FIREWALL
//
//  This module — and ONLY this module — assigns `status: 'VERIFIED'`, and it
//  does so exclusively from a live CourtListener response. No model output is
//  ever trusted to confirm a citation. (RUBRIC R3; verified by test/r3-grep.)
//
//  CourtListener's citation-lookup endpoint is throttled to 5 requests/minute,
//  so we send EVERY citation in a single batch call (`prime`) and then read each
//  verdict from cache. Only the cites that don't resolve at their reporter
//  location trigger a (rarer) name search.
// ============================================================================

const CL_BASE = 'https://www.courtlistener.com/api/rest/v4';
const FETCH_TIMEOUT_MS = 12_000;

/**
 * What CourtListener tells us about one citation. `null` === unreachable.
 * A reporter cite can match MORE THAN ONE opinion (the endpoint returns
 * per-citation status 300 with several clusters — duplicates or companion
 * cases), so we carry all candidates and let the caller pick the one whose
 * name matches the cited case.
 */
export interface CiteLookupResult {
  found: boolean;
  candidates: { url: string | null; caseName: string | null }[];
}

/**
 * The verifier depends on this interface, not on `fetch` directly, so the
 * mapping logic below can be exercised against a mocked CourtListener in unit
 * tests (exact→VERIFIED, name-only→HIGH_CONFIDENCE, miss→FLAGGED,
 * network-fail→UNVERIFIED).
 */
export interface CourtListenerClient {
  /** Optional one-shot batch lookup of every cite in `text`, cached for reuse. */
  prime?(text: string): Promise<void>;
  /** Resolve one reporter cite (e.g. "550 U.S. 544"). null = unreachable. */
  lookupByCite(normalizedCite: string): Promise<CiteLookupResult | null>;
  /** Search opinions by case name. null = unreachable. */
  searchByName(caseName: string): Promise<CiteLookupResult | null>;
}

/**
 * Verify a single citation string against CourtListener. Pure decision logic on
 * top of the injected client — this is the function the unit tests target.
 */
export function verifyCitation(
  raw: string,
  client: CourtListenerClient,
): Promise<LedgerEntry> {
  return verifyParsed(parseCitation(raw), client);
}

/** Verify an already-parsed citation. The pure decision logic (unit-tested). */
export async function verifyParsed(
  parsed: ParsedCitation,
  client: CourtListenerClient,
): Promise<LedgerEntry> {
  const started = Date.now();
  const base: Omit<LedgerEntry, 'status' | 'note' | 'latencyMs'> = {
    raw: parsed.raw,
    caseName: parsed.caseName,
    normalizedCite: parsed.normalizedCite,
    url: null,
  };
  const finish = (
    status: CitationStatus,
    note: string,
    extra: Partial<LedgerEntry> = {},
  ): LedgerEntry => ({
    ...base,
    status,
    note,
    latencyMs: Date.now() - started,
    ...extra,
  });

  // 1. Unparseable cite — a model couldn't even produce a real reporter pattern.
  if (!parsed.normalizedCite) {
    return finish(
      'UNVERIFIED',
      'Could not parse a reporter citation from this reference.',
    );
  }

  // 2. Look the reporter cite up in the live database.
  const byCite = await client.lookupByCite(parsed.normalizedCite);
  if (byCite === null) {
    return finish(
      'UNVERIFIED',
      'CourtListener was unreachable — database unavailable, not confirmed.',
    );
  }

  if (byCite.found) {
    // If there is no real cited case name to verify against — a subsequent-
    // history fragment ("rev'd on other grounds") or a paste artifact — we can
    // neither VERIFY (nothing to confirm) nor MISMATCH (nothing to mismatch).
    // Report it benignly. This guard runs FIRST so a stray fragment token can't
    // accidentally match a candidate's party name.
    if (!hasCaseName(parsed.caseName)) {
      return finish(
        'UNVERIFIED',
        'Citation fragment — no case name to confirm against the resolved opinion.',
        { url: byCite.candidates[0]?.url ?? null, actualCaseName: byCite.candidates[0]?.caseName ?? null },
      );
    }
    // A real opinion sits at this reporter cite. Does one of the matching
    // opinions carry the cited case name? If yes, this is a genuine VERIFIED
    // (even when the cite matched several opinions).
    const match = byCite.candidates.find((c) => nameMatches(parsed.caseName, c.caseName));
    if (match) {
      return finish('VERIFIED', 'Confirmed: real opinion found at this citation.', {
        url: match.url,
        actualCaseName: match.caseName,
      });
    }
    // The cite resolves to a real opinion, but to a DIFFERENT case than the one
    // named. We cannot call this VERIFIED — the cite+name pair does not match.
    // (Could be an AI fabrication, a wrong reporter location, or a companion
    // case; the honest verdict is "confirm this is the intended authority".)
    const first = byCite.candidates[0];
    return finish(
      'CITE_MISMATCH',
      `Cite resolves to "${
        first?.caseName || 'an opinion'
      }", which is NOT the cited case — confirm this is the intended authority. Not verified; do not rely on it as cited.`,
      { url: first?.url ?? null, actualCaseName: first?.caseName ?? null },
    );
  }

  // 3. No opinion at the cite. Maybe the case exists under a different cite?
  const byName = parsed.caseName ? await client.searchByName(parsed.caseName) : null;
  if (byName === null && parsed.caseName) {
    return finish(
      'UNVERIFIED',
      'CourtListener was unreachable — database unavailable, not confirmed.',
    );
  }

  if (byName && byName.found) {
    const c = byName.candidates[0];
    return finish(
      'HIGH_CONFIDENCE',
      'The case name was found in CourtListener, but not at the cited reporter location — verify the citation.',
      { url: c?.url ?? null, actualCaseName: c?.caseName ?? null },
    );
  }

  // 4. Nothing matched anywhere. Could not confirm — flag for manual review.
  // A no-match is NOT proof of fabrication: the opinion may be unpublished, very
  // recent, or in a reporter/database CourtListener doesn't fully cover.
  return finish(
    'FLAGGED',
    "No match found in CourtListener — verify manually. May be fabricated, or unpublished, very recent, or in a reporter/database CourtListener doesn't fully cover.",
  );
}

// ---- The real CourtListener client (uses fetch + the env token) ----

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Token ${token}` };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function absoluteUrl(path: string | undefined | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://www.courtlistener.com${path}`;
}

function normCiteKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

interface CitationLookupEntry {
  status: number;
  citation?: string;
  normalized_citations?: string[];
  clusters?: Array<{ absolute_url?: string; case_name?: string }>;
}

/** Live CourtListener client. Any network/HTTP failure resolves to `null` (degraded). */
export function createCourtListenerClient(token: string): CourtListenerClient {
  // Batch state, populated by prime() — one citation-lookup call for the whole brief.
  let primed = false;
  let degraded = false; // batch call failed → treat cache misses as unreachable
  const cache = new Map<string, CiteLookupResult>();

  async function rawLookup(text: string): Promise<CitationLookupEntry[] | null> {
    try {
      const res = await fetchWithTimeout(`${CL_BASE}/citation-lookup/`, {
        method: 'POST',
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ text }).toString(),
      });
      if (!res.ok) return null; // 429/5xx/etc → degraded, never a false VERIFIED
      const data = (await res.json()) as CitationLookupEntry[];
      return Array.isArray(data) ? data : [];
    } catch {
      return null;
    }
  }

  function toResult(entry: CitationLookupEntry): CiteLookupResult {
    const clusters = entry.clusters ?? [];
    // status 200 = unique match, 300 = multiple matches (still real opinions).
    const found = (entry.status === 200 || entry.status === 300) && clusters.length > 0;
    return {
      found,
      candidates: clusters.map((c) => ({
        url: absoluteUrl(c.absolute_url),
        caseName: c.case_name ?? null,
      })),
    };
  }

  function indexEntry(entry: CitationLookupEntry): void {
    const result = toResult(entry);
    const keys = [entry.citation, ...(entry.normalized_citations ?? [])].filter(
      (k): k is string => !!k,
    );
    for (const k of keys) cache.set(normCiteKey(k), result);
  }

  return {
    async prime(text: string): Promise<void> {
      primed = true;
      const data = await rawLookup(text);
      if (data === null) {
        degraded = true;
        return;
      }
      for (const entry of data) indexEntry(entry);
    },

    async lookupByCite(normalizedCite: string): Promise<CiteLookupResult | null> {
      const key = normCiteKey(normalizedCite);
      if (primed) {
        if (cache.has(key)) return cache.get(key)!;
        if (degraded) return null; // batch failed and we have no cached answer
        return { found: false, candidates: [] }; // CL parsed no opinion here
      }
      // Not primed (e.g. used directly) — fall back to a single lookup.
      const data = await rawLookup(normalizedCite);
      if (data === null) return null;
      return data[0]
        ? toResult(data[0])
        : { found: false, candidates: [] };
    },

    async searchByName(caseName: string): Promise<CiteLookupResult | null> {
      try {
        const url = `${CL_BASE}/search/?type=o&page_size=5&q=${encodeURIComponent(
          caseName,
        )}`;
        const res = await fetchWithTimeout(url, { headers: authHeaders(token) });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          results?: Array<{ caseName?: string; case_name?: string; absolute_url?: string }>;
        };
        const candidates = (data.results ?? [])
          .map((r) => ({
            url: absoluteUrl(r.absolute_url),
            caseName: r.caseName ?? r.case_name ?? null,
          }))
          .filter((c) => nameMatches(caseName, c.caseName));
        return { found: candidates.length > 0, candidates };
      } catch {
        return null;
      }
    },
  };
}

/**
 * Verify many citations: prime one batch lookup, then resolve each from cache,
 * caching verdicts by normalized cite for re-runs. `onEntry` streams each
 * verdict (with its CourtListener latency) to the SSE bus as it lands.
 */
export async function verifyAll(
  rawCitations: string[],
  client: CourtListenerClient,
  onEntry?: (entry: LedgerEntry) => void,
  shouldHalt?: () => boolean,
  delayMs = 150,
): Promise<LedgerEntry[]> {
  // One batch citation-lookup for every cite in the brief (avoids the 5/min
  // throttle). Normalize first so cites split across PDF line breaks reassemble
  // before CourtListener parses them.
  await client.prime?.(normalizeForCites(rawCitations.join('\n')));

  // Expand real-world strings into individual cites: a string cite ("A …; B …")
  // becomes one entry per authority; an unparseable reference stays as a single
  // (null-cite) entry so it still surfaces as UNVERIFIED.
  const parsedList: ParsedCitation[] = rawCitations.flatMap((raw) => {
    const cites = parseCitations(raw);
    return cites.length > 0 ? cites : [parseCitation(raw)];
  });

  const verdicts = new Map<string, LedgerEntry>();
  const ledger: LedgerEntry[] = [];
  for (const parsed of parsedList) {
    if (shouldHalt?.()) break;
    const key = parsed.normalizedCite ?? parsed.raw.trim();
    let entry = verdicts.get(key);
    if (!entry) {
      entry = await verifyParsed(parsed, client);
      verdicts.set(key, entry);
      if (delayMs > 0) await sleep(delayMs);
    } else {
      entry = { ...entry, raw: parsed.raw };
    }
    ledger.push(entry);
    onEntry?.(entry);
  }
  return ledger;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
