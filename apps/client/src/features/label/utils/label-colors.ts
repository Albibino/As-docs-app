import { LabelColorKey } from "@/features/label/types/label.types.ts";

export type LabelColor = {
  bg: string;
  fg: string;
  dot: string;
};

const LABEL_PALETTE: Record<LabelColorKey, LabelColor> = {
  slate: { bg: "#eef1f5", fg: "#3b475a", dot: "#6b7a90" },
  blue: { bg: "#e6f0ff", fg: "#1e4fbf", dot: "#3b82f6" },
  cyan: { bg: "#e1f5fb", fg: "#14738a", dot: "#2fabc7" },
  teal: { bg: "#daf1ee", fg: "#1f6f6a", dot: "#2fa39a" },
  green: { bg: "#e3f5ea", fg: "#1f7a47", dot: "#22a05a" },
  lime: { bg: "#edf6df", fg: "#567b16", dot: "#80b82b" },
  yellow: { bg: "#fbf4cf", fg: "#7a6400", dot: "#d5b91f" },
  amber: { bg: "#fbf0d9", fg: "#8a5a00", dot: "#d99c1f" },
  orange: { bg: "#fcebdd", fg: "#9c4e10", dot: "#e78635" },
  red: { bg: "#fde6e6", fg: "#a02b2b", dot: "#dc4a4a" },
  rose: { bg: "#fbe5e8", fg: "#a32943", dot: "#db5870" },
  pink: { bg: "#fce6ee", fg: "#a8336d", dot: "#dc6699" },
  fuchsia: { bg: "#f9e5fa", fg: "#952a99", dot: "#c84dca" },
  purple: { bg: "#efe9fb", fg: "#5a3aa8", dot: "#8b6bd9" },
  violet: { bg: "#eee7fc", fg: "#6840a9", dot: "#976cdd" },
  indigo: { bg: "#e8eaff", fg: "#3e46a8", dot: "#5c63d8" },
};

const PALETTE_KEYS = Object.keys(LABEL_PALETTE) as LabelColorKey[];
const LEGACY_PALETTE_KEYS: LabelColorKey[] = [
  "slate",
  "blue",
  "green",
  "amber",
  "red",
  "purple",
  "pink",
  "teal",
];

const DARK_PALETTE: Record<string, LabelColor> = {
  slate: { bg: "#2a3140", fg: "#c8d3e3", dot: "#7e8da8" },
  blue: { bg: "#152a52", fg: "#a9c4ff", dot: "#5b9aff" },
  cyan: { bg: "#103842", fg: "#8bdbea", dot: "#4fc3dc" },
  teal: { bg: "#103633", fg: "#92d5cf", dot: "#48b8af" },
  green: { bg: "#143b27", fg: "#9ce3b8", dot: "#3ec97c" },
  lime: { bg: "#293a12", fg: "#c5e988", dot: "#a7d84b" },
  yellow: { bg: "#3d3508", fg: "#f5df7d", dot: "#e6cc4b" },
  amber: { bg: "#3d2c0e", fg: "#f5cf85", dot: "#e6b34a" },
  orange: { bg: "#44250e", fg: "#ffc28a", dot: "#f29a4a" },
  red: { bg: "#401a1a", fg: "#f1a8a8", dot: "#e26565" },
  rose: { bg: "#421720", fg: "#f3a7b4", dot: "#e57489" },
  pink: { bg: "#3c1a2a", fg: "#f3a9c9", dot: "#e07ab0" },
  fuchsia: { bg: "#421944", fg: "#efadef", dot: "#d96cda" },
  purple: { bg: "#2a1f4d", fg: "#c8b4f4", dot: "#a48ce6" },
  violet: { bg: "#2d2050", fg: "#cfbaf5", dot: "#ac8ae8" },
  indigo: { bg: "#20244f", fg: "#b4b9ff", dot: "#747bfa" },
};

function hashName(name: string): number {
  // Per-char accumulation with 31. Note: 31 ≡ -1 (mod 8), so the low bits of
  // this hash are highly correlated across short strings — `% 8` would cluster.
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  }
  // Murmur3 fmix32 finalizer — avalanches high bits into low bits so the
  // subsequent `% palette.length` (small power of two) is well-distributed.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Palette keys used by the admin color picker and persistence contract. */
export const LABEL_COLOR_KEYS = PALETTE_KEYS;

/** Default color used by taxonomy trees without an explicitly configured color. */
export const DEFAULT_LABEL_TREE_COLOR: LabelColorKey = "slate";

export function resolveLabelTreeColor(
  color?: LabelColorKey | null,
): LabelColorKey {
  return color ?? DEFAULT_LABEL_TREE_COLOR;
}

type RgbColor = [number, number, number];

function parseHexColor(value: string): RgbColor | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;

  return [0, 1, 2].map((index) =>
    Number.parseInt(match[1].slice(index * 2, index * 2 + 2), 16),
  ) as RgbColor;
}

/** Maps a color value to the closest supported label palette key. */
export function getClosestLabelColorKey(value: string): LabelColorKey {
  const input = parseHexColor(value);
  if (!input) return PALETTE_KEYS[0];

  let closestKey = PALETTE_KEYS[0];
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const key of PALETTE_KEYS) {
    const paletteColor = parseHexColor(LABEL_PALETTE[key].dot);
    if (!paletteColor) continue;

    const distance = paletteColor.reduce(
      (total, channel, index) => total + (channel - input[index]) ** 2,
      0,
    );

    if (distance < closestDistance) {
      closestKey = key;
      closestDistance = distance;
    }
  }

  return closestKey;
}

export const LABEL_COLOR_PICKER_MIN_BRIGHTNESS = 18;
export const LABEL_COLOR_PICKER_MAX_BRIGHTNESS = 82;

type HsvColor = [number, number, number];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

/** Parses an opaque hex color into HSV percentages used by Mantine. */
export function hexToHsv(value: string): HsvColor | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;

  const [red, green, blue] = rgb.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const saturation = max === 0 ? 0 : delta / max;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta + 6) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  return [hue, saturation * 100, max * 100];
}

/** Converts HSV percentages into the opaque hex value used by Mantine. */
export function hsvToHex(
  hue: number,
  saturation: number,
  brightness: number,
): string {
  const normalizedHue = (((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360;
  const normalizedSaturation =
    clamp(Number.isFinite(saturation) ? saturation : 0, 0, 100) / 100;
  const normalizedBrightness =
    clamp(Number.isFinite(brightness) ? brightness : 0, 0, 100) / 100;
  const chroma = normalizedBrightness * normalizedSaturation;
  const segment = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = normalizedBrightness - chroma;
  const [red, green, blue] =
    segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/** Keeps picker colors away from pure black and white. */
export function normalizeLabelPickerColor(value: string): string {
  const [hue, saturation, brightness] = hexToHsv(value) ?? [210, 75, 50];

  return hsvToHex(
    hue,
    saturation,
    clamp(
      brightness,
      LABEL_COLOR_PICKER_MIN_BRIGHTNESS,
      LABEL_COLOR_PICKER_MAX_BRIGHTNESS,
    ),
  );
}

/**
 * Resolves a label's colours. An explicit palette key wins; without one the
 * colour is derived from the name, which keeps labels coined on the fly
 * visually distinct without anyone having to choose.
 */
export function getLabelColor(
  name: string,
  scheme: "light" | "dark" = "light",
  color?: LabelColorKey | null,
): LabelColor {
  const key =
    color && color in LABEL_PALETTE
      ? color
      : LEGACY_PALETTE_KEYS[hashName(name) % LEGACY_PALETTE_KEYS.length];
  const palette = scheme === "dark" ? DARK_PALETTE : LABEL_PALETTE;
  return palette[key];
}

const LIGHT_HIERARCHY_TONES = [0, 0.24, 0.48, 0.68] as const;
const DARK_HIERARCHY_TONES = [0, 0.2, 0.4, 0.58] as const;

function mixHex(source: string, target: string, amount: number): string {
  const sourceRgb = source
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16));
  const targetRgb = target
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16));

  if (
    !sourceRgb ||
    sourceRgb.length !== 3 ||
    !targetRgb ||
    targetRgb.length !== 3
  ) {
    return source;
  }

  const clampedAmount = Math.max(0, Math.min(amount, 1));
  const channels = sourceRgb.map((channel, index) =>
    Math.round(channel + (targetRgb[index] - channel) * clampedAmount),
  );

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Applies a soft background while preserving the exact taxonomy dot color. */
export function getLabelChipBackground(dot: string): string {
  const rgb = parseHexColor(dot);
  if (!rgb) return dot;

  return `rgba(${rgb.join(", ")}, 0.18)`;
}

/**
 * Derives opaque colours for taxonomy nodes from their tree colour. The root
 * keeps the selected palette swatch and descendants become lighter without
 * losing the hue or turning transparent.
 */
export function getLabelHierarchyColor(
  treeName: string,
  treeColor: LabelColorKey | null,
  depth: number,
  scheme: "light" | "dark" = "light",
): LabelColor {
  const base = getLabelColor(
    treeName,
    scheme,
    resolveLabelTreeColor(treeColor),
  );
  const tones =
    scheme === "light" ? LIGHT_HIERARCHY_TONES : DARK_HIERARCHY_TONES;
  const amount = tones[Math.min(Math.max(0, depth), tones.length - 1)];
  const source = scheme === "light" ? base.dot : base.bg;
  const bg = mixHex(source, "#ffffff", amount);

  return {
    bg,
    // The palette foreground is intentionally the stronger shade of the same
    // hue. The chip applies a soft translucent background, so this keeps the
    // taxonomy colour visible without falling back to neutral text.
    fg: base.fg,
    dot: mixHex(base.dot, "#ffffff", Math.min(amount * 0.45, 0.36)),
  };
}
