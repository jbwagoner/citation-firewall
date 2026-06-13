/** Collapse whitespace and lowercase, for tolerant substring comparison. */
export function normalizeWS(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Does `passage` actually appear in the brief? Used to enforce RUBRIC R6 —
 * every Opposing Counsel attack must quote a real passage. Tolerant of
 * surrounding quotes, ellipses, and whitespace differences, but still requires
 * the substance to be present verbatim in the source text.
 */
export function passageInBrief(passage: string, brief: string): boolean {
  const p = normalizeWS(passage.replace(/^["'“‘\s.]+|["'”’\s.]+$/g, ''));
  if (p.length < 8) return false; // too short to be a meaningful quote
  return normalizeWS(brief).includes(p);
}
