/** Combining diacritical marks, stripped after NFD so "é" folds to "e". */
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Mirrors the server's slug derivation closely enough to tell whether a typed
 * name already exists before asking. The server remains the authority — it
 * reuses a matching label rather than creating a duplicate — so a small
 * divergence here costs a redundant round trip, never a duplicate.
 */
export function normalizeLabelName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
