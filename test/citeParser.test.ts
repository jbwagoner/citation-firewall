import { describe, it, expect } from 'vitest';
import {
  parseCitation,
  parseCitations,
  nameMatches,
  nameTokens,
  hasCaseName,
} from '../src/citeParser.js';

describe('parseCitation', () => {
  it('parses a U.S. Reports citation', () => {
    const p = parseCitation('Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)');
    expect(p.volume).toBe('550');
    expect(p.reporter).toBe('U.S.');
    expect(p.page).toBe('544');
    expect(p.normalizedCite).toBe('550 U.S. 544');
    expect(p.caseName).toContain('Twombly');
  });

  it('parses an F.3d citation with a circuit + year parenthetical', () => {
    const p = parseCitation(
      'Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015)',
    );
    expect(p.volume).toBe('784');
    expect(p.reporter).toBe('F.3d');
    expect(p.page).toBe('412');
    expect(p.normalizedCite).toBe('784 F.3d 412');
  });

  it('returns a null cite for unparseable references', () => {
    const p = parseCitation('see the attached memorandum');
    expect(p.normalizedCite).toBeNull();
    expect(p.volume).toBeNull();
  });

  // Real-world brief formatting the demo's clean cites didn't exercise.
  it('handles a pincite after the first page', () => {
    const p = parseCitation('Meritor Sav. Bank v. Vinson, 477 U.S. 57, 64 (1986)');
    expect(p.normalizedCite).toBe('477 U.S. 57'); // pincite discarded; matches CL key
    expect(p.caseName).toContain('Vinson');
  });

  it('handles a pincite range', () => {
    const p = parseCitation('Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248-49 (1986)');
    expect(p.normalizedCite).toBe('477 U.S. 242');
  });

  it('strips a leading "see also" signal from the case name', () => {
    const p = parseCitation('see also Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 255 (1986)');
    expect(p.normalizedCite).toBe('477 U.S. 242');
    expect(p.caseName).toMatch(/^Anderson/); // "see also" removed
  });

  it('strips an embedded docket "No." from the case name', () => {
    const p = parseCitation('Gratz v. Bollinger, No. 02-516, 539 U.S. 244 (2003)');
    expect(p.normalizedCite).toBe('539 U.S. 244');
    expect(p.caseName).not.toMatch(/No\./);
    expect(p.caseName).toContain('Bollinger');
  });

  it('handles a multi-word reporter with a pincite', () => {
    const p = parseCitation('Doe v. Roe, 410 F. Supp. 2d 552, 558 (S.D.N.Y. 2006)');
    expect(p.normalizedCite).toBe('410 F. Supp. 2d 552');
  });
});

describe('paste-mangled (PDF) text — the real-user case', () => {
  // The Tinker false-flag: parallel cites with collapsed/odd spacing must still
  // resolve to the OFFICIAL cite (393 U.S. 503), never a garbage or last-parallel cite.
  it('parallel cites collapse to the official U.S. cite (clean spacing)', () => {
    const cites = parseCitations(
      'Tinker v. Des Moines Indep. Cmty. Sch. Dist., 393 U.S. 503, 89 S.Ct. 733, 21 L.Ed.2d 731 (1969)',
    );
    expect(cites).toHaveLength(1); // one authority, not three
    expect(cites[0].normalizedCite).toBe('393 U.S. 503');
    expect(cites[0].caseName).toMatch(/^Tinker/);
  });

  it('parallel cites jammed with no space after commas', () => {
    const cites = parseCitations('Tinker v. Des Moines, 393 U.S. 503,89 S.Ct. 733,21 L.Ed.2d 731 (1969)');
    expect(cites).toHaveLength(1);
    expect(cites[0].normalizedCite).toBe('393 U.S. 503');
  });

  it('citation split across a line break is reassembled', () => {
    const cites = parseCitations('Tinker v. Des Moines, 393 U.S.\n503, 89 S.Ct. 733\n(1969)');
    expect(cites[0].normalizedCite).toBe('393 U.S. 503');
  });

  it('collapsed whitespace / tabs / newlines in the case name and cite', () => {
    const cites = parseCitations('Roe   v.\tWade,\n410   U.S.   113   (1973)');
    expect(cites[0].normalizedCite).toBe('410 U.S. 113');
    expect(cites[0].caseName).toMatch(/Roe v\. Wade/);
  });

  it('canonicalizes reporter spacing ("S.Ct." → "S. Ct.") to match CourtListener keys', () => {
    expect(parseCitation('Foo v. Bar, 89 S.Ct. 733 (1969)').normalizedCite).toBe('89 S. Ct. 733');
    expect(parseCitation('Foo v. Bar, 21 L.Ed.2d 731 (1969)').normalizedCite).toBe('21 L. Ed. 2d 731');
  });

  it('a subsequent-history fragment is not a real case name', () => {
    const cites = parseCitations("(rev'd on other grounds, 412 U.S. 94 (1973))");
    expect(cites[0].normalizedCite).toBe('412 U.S. 94');
    expect(hasCaseName(cites[0].caseName)).toBe(false); // → verifier won't call it a mismatch
  });

  it('a real "X v. Y" name reads as a case name', () => {
    expect(hasCaseName('Tinker v. Des Moines')).toBe(true);
    expect(hasCaseName('In re Marriage of Smith')).toBe(true);
    expect(hasCaseName('on other grounds')).toBe(false);
  });
});

describe('parseCitations (string cites)', () => {
  it('splits a semicolon string cite into one entry per authority', () => {
    const cites = parseCitations(
      'Celotex Corp. v. Catrett, 477 U.S. 317, 322 (1986); Matsushita Elec. Indus. Co. v. Zenith Radio Corp., 475 U.S. 574, 587 (1986)',
    );
    expect(cites).toHaveLength(2);
    expect(cites[0].normalizedCite).toBe('477 U.S. 317');
    expect(cites[0].caseName).toContain('Celotex');
    expect(cites[1].normalizedCite).toBe('475 U.S. 574');
    expect(cites[1].caseName).toContain('Matsushita');
  });

  it('returns a single entry for a single cite', () => {
    expect(parseCitations('Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)')).toHaveLength(1);
  });

  it('returns nothing for text with no citation', () => {
    expect(parseCitations('see the attached memorandum')).toHaveLength(0);
  });
});

describe('nameMatches — substantial, side-aware', () => {
  it('verifies exact, abbreviation, and initials variants', () => {
    expect(nameMatches('Bell Atlantic Corp. v. Twombly', 'Bell Atlantic Corp. v. Twombly')).toBe(true);
    expect(nameMatches('Two Pesos, Inc. v. Taco Cabana, Inc.', 'Two Pesos, Inc. v. Taco Cabana')).toBe(true);
    // "Dist." vs "District" abbreviation; "No. 403" already stripped by the parser.
    expect(nameMatches('Bethel School Dist. v. Fraser', 'Bethel School District No. 403 v. Fraser')).toBe(true);
    // Initials-only plaintiff on both sides → rely on the defendant.
    expect(nameMatches('M.A.L. v. Kinsland', 'M.A.L. Ex Rel. M.L. v. Kinsland')).toBe(true);
    expect(nameMatches('Gregory v. Shelby County', 'Gregory v. Shelby County')).toBe(true);
  });

  it('does NOT verify on a shared defendant when the plaintiff differs (Miller/Mosley)', () => {
    // The false-VERIFIED that prompted this fix: shared "City of Wickliffe", different plaintiff.
    expect(nameMatches('Miller v. City of Wickliffe', 'Julious Mosley v. City of Wickliffe')).toBe(false);
  });

  it('does NOT verify on a shared common government party alone', () => {
    expect(nameMatches('Smith v. County of Los Angeles', 'Johnson v. County of Los Angeles')).toBe(false);
    expect(nameMatches('Acme Corp. v. City of Chicago', 'Beta Corp. v. City of Chicago')).toBe(false);
  });

  it('rejects a fabricated name whose cite resolves to a different case', () => {
    expect(
      nameMatches('Sunhaven Brands, LLC v. Meridian Apparel Co.', 'Arie Friedman v. City of Highland Park'),
    ).toBe(false);
    expect(nameMatches('Sunhaven v. Meridian', 'United States v. Lopez')).toBe(false);
  });

  it('ignores corporate stop-words so they are not false positives', () => {
    expect(nameTokens('Acme Inc. v. Beta LLC')).not.toContain('inc');
    expect(nameTokens('Acme Inc. v. Beta LLC')).not.toContain('llc');
  });
});
