import { describe, it, expect } from 'vitest';
import { parseCitation, nameMatches, nameTokens } from '../src/citeParser.js';

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
