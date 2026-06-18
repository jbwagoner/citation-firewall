import { parseCitation, parseCitations, nameMatches } from './citeParser.js';
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

/** What CourtListener tells us about one citation. `null` === unreachable. */
export interface CiteLookupResult {
  found: boolean;
  url: string | null;
  actualCaseName: string | null;
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
    // A real opinion sits at this reporter cite. Does its name match the cited
    // case? If yes, this is a genuine VERIFIED. If the cite resolves to a
    // DIFFERENT case, the cited case+cite pair does not exist — that is the
    // classic fabrication signature, so we FLAG it rather than rubber-stamp it.
    if (nameMatches(parsed.caseName, byCite.actualCaseName)) {
      return finish('VERIFIED', 'Confirmed: real opinion found at this citation.', {
        url: byCite.url,
        actualCaseName: byCite.actualCaseName,
      });
    }
    return finish(
      'FLAGGED',
      `This reporter citation resolves to a different case (${
        byCite.actualCaseName ?? 'unknown'
      }). The cited case was not found at this citation — hallmark of AI fabrication. BLOCKED from synthesis.`,
      { url: byCite.url, actualCaseName: byCite.actualCaseName },
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
    return finish(
      'HIGH_CONFIDENCE',
      'The case name was found in CourtListener, but not at the cited reporter location — verify the citation.',
      { url: byName.url, actualCaseName: byName.actualCaseName },
    );
  }

  // 4. Nothing matched anywhere. This is the demo moment.
  return finish(
    'FLAGGED',
    'No matching opinion found in any reporter — hallmark of AI fabrication. BLOCKED from synthesis.',
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

  function indexEntry(entry: CitationLookupEntry): void {
    const cluster = entry.clusters?.[0];
    const result: CiteLookupResult = {
      found: entry.status === 200 && !!cluster,
      url: absoluteUrl(cluster?.absolute_url),
      actualCaseName: cluster?.case_name ?? null,
    };
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
        return { found: false, url: null, actualCaseName: null }; // CL parsed no opinion here
      }
      // Not primed (e.g. used directly) — fall back to a single lookup.
      const data = await rawLookup(normalizedCite);
      if (data === null) return null;
      const entry = data[0];
      const cluster = entry?.clusters?.[0];
      return {
        found: !!entry && entry.status === 200 && !!cluster,
        url: absoluteUrl(cluster?.absolute_url),
        actualCaseName: cluster?.case_name ?? null,
      };
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
        const results = data.results ?? [];
        for (const r of results) {
          const name = r.caseName ?? r.case_name ?? null;
          if (nameMatches(caseName, name)) {
            return { found: true, url: absoluteUrl(r.absolute_url), actualCaseName: name };
          }
        }
        return { found: false, url: null, actualCaseName: null };
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
  // One batch citation-lookup for every cite in the brief (avoids the 5/min throttle).
  await client.prime?.(rawCitations.join('\n'));

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
