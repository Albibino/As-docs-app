export const MAX_LABEL_NAME_LENGTH = 60;
export const MAX_LABEL_DESCRIPTION_LENGTH = 280;

/** Combining diacritical marks, stripped after NFD so "é" folds to "e". */
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Labels carry a free display name ("Escopo Técnico") and a derived slug used
 * for uniqueness within a scope. Accents and punctuation are folded away, so
 * "Escopo Técnico" and "escopo tecnico" collide on purpose — two labels that
 * read the same to a human should not coexist in one space.
 *
 * Written out rather than reaching for a slug library: the rule has to match
 * `normalizeLabelName` on the client character for character, and the obvious
 * candidate (`@sindresorhus/slugify`) both adds transformations we don't want
 * and is ESM-only, which breaks every Jest suite that reaches this file.
 */
export function toLabelSlug(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * A name is usable when it survives slugification with something left. Names
 * made purely of punctuation or emoji slug down to an empty string and would
 * otherwise all collide on ''.
 */
export function isValidLabelName(name: string): boolean {
  const trimmed = name?.trim() ?? '';
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_LABEL_NAME_LENGTH &&
    toLabelSlug(trimmed).length > 0
  );
}
