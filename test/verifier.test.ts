import { describe, it, expect } from 'vitest';
import { verifyCitation, type CourtListenerClient } from '../src/verifier.js';

const REAL = 'Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)';
const FAKE = 'Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015)';

function client(over: Partial<CourtListenerClient>): CourtListenerClient {
  return {
    lookupByCite: async () => ({ found: false, url: null, actualCaseName: null }),
    searchByName: async () => ({ found: false, url: null, actualCaseName: null }),
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
          url: 'https://www.courtlistener.com/opinion/1/twombly/',
          actualCaseName: 'Bell Atlantic Corp. v. Twombly',
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
        lookupByCite: async () => ({ found: false, url: null, actualCaseName: null }),
        searchByName: async () => ({
          found: true,
          url: 'https://www.courtlistener.com/opinion/1/twombly/',
          actualCaseName: 'Bell Atlantic Corp. v. Twombly',
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
          url: 'https://www.courtlistener.com/opinion/9/other/',
          actualCaseName: 'United States v. Lopez',
        }),
      }),
    );
    expect(e.status).toBe('FLAGGED');
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
