export const LABEL_PICKER_MIN_WIDTH = 240;
export const LABEL_PICKER_MAX_WIDTH = 300;
export const LABEL_PICKER_INDENT_STEP = 14;

const OPTION_EXTRA_WIDTH = 54;
const SECTION_EXTRA_WIDTH = 22;
const AUXILIARY_EXTRA_WIDTH = 24;

export type LabelPickerWidthOption = {
  path: string;
  depth?: number;
};

export type LabelPickerWidthSection = {
  title: string;
  hint?: string;
};

export type LabelPickerWidthInput = {
  options: readonly LabelPickerWidthOption[];
  sectionTitles: readonly LabelPickerWidthSection[];
  auxiliaryTexts: readonly string[];
  measureText: (text: string) => number;
};

const maxMeasuredWidth = (
  texts: readonly string[],
  extraWidth: number,
  measureText: (text: string) => number,
) => Math.max(0, ...texts.map((text) => measureText(text) + extraWidth));

/** Calculates the intrinsic width of the complete label picker. */
export function calculateLabelPickerWidth({
  options,
  sectionTitles,
  auxiliaryTexts,
  measureText,
}: LabelPickerWidthInput): number {
  const optionsWidth = Math.max(
    0,
    ...options.map(
      ({ path, depth = 0 }) =>
        measureText(path) +
        OPTION_EXTRA_WIDTH +
        depth * LABEL_PICKER_INDENT_STEP,
    ),
  );
  const sectionsWidth = Math.max(
    0,
    ...sectionTitles.map(
      ({ title, hint }) =>
        measureText(title) +
        (hint ? measureText(hint) + 6 : 0) +
        SECTION_EXTRA_WIDTH,
    ),
  );
  const auxiliaryWidth = maxMeasuredWidth(
    auxiliaryTexts,
    AUXILIARY_EXTRA_WIDTH,
    measureText,
  );
  const intrinsicWidth = Math.ceil(
    Math.max(optionsWidth, sectionsWidth, auxiliaryWidth),
  );

  return Math.max(
    LABEL_PICKER_MIN_WIDTH,
    Math.min(LABEL_PICKER_MAX_WIDTH, intrinsicWidth),
  );
}
