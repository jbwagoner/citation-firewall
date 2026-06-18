import { describe, it, expect } from 'vitest';
import { parseCitation, parseCitations, nameMatches, nameTokens } from '../src/citeParser.js';

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

describe('nameMatches', () => {
  it('matches on a shared party surname', () => {
    expect(
      nameMatches('Bell Atlantic Corp. v. Twombly', 'Bell Atlantic Corp. v. Twombly'),
    ).toBe(true);
    expect(nameMatches('Two Pesos, Inc. v. Taco Cabana, Inc.', 'Two Pesos, Inc. v. Taco Cabana')).toBe(
      true,
    );
  });

  it('does not match unrelated case names', () => {
    expect(nameMatches('Sunhaven v. Meridian', 'United States v. Lopez')).toBe(false);
  });

  it('ignores corporate stop-words so they are not false positives', () => {
    expect(nameTokens('Acme Inc. v. Beta LLC')).not.toContain('inc');
    expect(nameTokens('Acme Inc. v. Beta LLC')).not.toContain('llc');
  });
});
