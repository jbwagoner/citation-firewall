import { describe, it, expect } from 'vitest';
import { verifyCitation, type CourtListenerClient } from '../src/verifier.js';

const REAL = 'Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)';
const FAKE = 'Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015)';

function client(over: Partial<CourtListenerClient>): CourtListenerClient {
  return {
    lookupByCite: async () => ({ found: false, candidates: [] }),
    searchByName: async () => ({ found: false, candidates: [] }),
    ...over,
  };
}

describe('verifier mapping (mocked CourtListener)', () => {
  it('exact reporter-cite + matching name → VERIFIED, with link', async () => {
    const e = await verifyCitation(
      REAL,
      client({
        lookupByCite: async () => ({
          found: true,
          candidates: [
            {
              url: 'https://www.courtlistener.com/opinion/1/twombly/',
              caseName: 'Bell Atlantic Corp. v. Twombly',
            },
          ],
        }),
      }),
    );
    expect(e.status).toBe('VERIFIED');
    expect(e.url).toMatch(/courtlistener\.com/);
  });

  it('name found but not at the cited reporter location → HIGH_CONFIDENCE', async () => {
    const e = await verifyCitation(
      REAL,
      client({
        lookupByCite: async () => ({ found: false, candidates: [] }),
        searchByName: async () => ({
          found: true,
          candidates: [
            {
              url: 'https://www.courtlistener.com/opinion/1/twombly/',
              caseName: 'Bell Atlantic Corp. v. Twombly',
            },
          ],
        }),
      }),
    );
    expect(e.status).toBe('HIGH_CONFIDENCE');
  });

  it('no opinion anywhere → FLAGGED (the demo moment)', async () => {
    const e = await verifyCitation(FAKE, client({}));
    expect(e.status).toBe('FLAGGED');
    expect(e.note.toLowerCase()).toContain('no matching opinion');
  });

  it('cite resolves to a DIFFERENT case → FLAGGED (fabrication signature)', async () => {
    const e = await verifyCitation(
      FAKE,
      client({
        lookupByCite: async () => ({
          found: true,
          candidates: [
            {
              url: 'https://www.courtlistener.com/opinion/9/other/',
              caseName: 'United States v. Lopez',
            },
          ],
        }),
      }),
    );
    expect(e.status).toBe('FLAGGED');
  });

  it('cite with MULTIPLE matches (status 300) → VERIFIED when one candidate name matches', async () => {
    const e = await verifyCitation(
      'Gregory v. Shelby County, 220 F.3d 433 (6th Cir. 2000)',
      client({
        lookupByCite: async () => ({
          found: true,
          candidates: [
            { url: 'https://www.courtlistener.com/opinion/a/', caseName: '' },
            {
              url: 'https://www.courtlistener.com/opinion/b/gregory-v-shelby-county/',
              caseName: 'Gregory v. Shelby County',
            },
          ],
        }),
      }),
    );
    expect(e.status).toBe('VERIFIED');
    expect(e.url).toContain('gregory-v-shelby-county');
  });

  it('CourtListener unreachable → UNVERIFIED (database unavailable, never a false VERIFIED)', async () => {
    const e = await verifyCitation(
      REAL,
      client({ lookupByCite: async () => null, searchByName: async () => null }),
    );
    expect(e.status).toBe('UNVERIFIED');
    expect(e.note.toLowerCase()).toContain('unreachable');
  });

  it('unparseable citation → UNVERIFIED (never reaches the network)', async () => {
    let called = false;
    const e = await verifyCitation(
      'see the attached memorandum of law',
      client({
        lookupByCite: async () => {
          called = true;
          return null;
        },
      }),
    );
    expect(e.status).toBe('UNVERIFIED');
    expect(called).toBe(false);
  });
});
