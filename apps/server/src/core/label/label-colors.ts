/**
 * Colours are stored as palette keys rather than hex values so each label
 * renders correctly in both light and dark themes — the client owns the actual
 * swatches. This list only exists to validate input; it must stay in step with
 * the palette in `apps/client/src/features/label/utils/label-colors.ts`.
 */
export const LABEL_COLORS = [
  'slate',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'red',
  'rose',
  'pink',
  'fuchsia',
  'purple',
  'violet',
  'indigo',
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];
