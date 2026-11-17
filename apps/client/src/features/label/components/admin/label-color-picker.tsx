import { useEffect, useId, useState } from "react";
import {
  ColorSwatch,
  Group,
  HueSlider,
  Text,
  VisuallyHidden,
  useComputedColorScheme,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { LabelColorKey } from "@/features/label/types/label.types.ts";
import {
  getClosestLabelColorKey,
  getLabelColor,
  LABEL_COLOR_PICKER_MAX_BRIGHTNESS,
  LABEL_COLOR_PICKER_MIN_BRIGHTNESS,
  hexToHsv,
  hsvToHex,
  normalizeLabelPickerColor,
} from "@/features/label/utils/label-colors.ts";

type LabelColorPickerProps = {
  value: LabelColorKey | null;
  onChange: (color: LabelColorKey | null) => void;
  /** The tree name provides the preview fallback when no color is stored. */
  previewName: string;
  fallbackColor?: LabelColorKey | null;
};

type PickerHsv = [number, number, number];

const MIN_INTERACTIVE_SATURATION = 75;
const MIN_INTERACTIVE_BRIGHTNESS = 70;

function getPickerHsv(color: string): PickerHsv {
  const [hue, saturation, brightness] = hexToHsv(
    normalizeLabelPickerColor(color),
  ) ?? [210, 75, 50];

  return [
    hue,
    Math.max(saturation, MIN_INTERACTIVE_SATURATION),
    Math.max(brightness, MIN_INTERACTIVE_BRIGHTNESS),
  ];
}

export function LabelColorPicker({
  value,
  onChange,
  previewName,
  fallbackColor,
}: LabelColorPickerProps) {
  const { t } = useTranslation();
  const scheme = useComputedColorScheme("light");
  const descriptionId = `${useId()}-description`;
  const selectedColor = getLabelColor(
    previewName,
    scheme,
    value ?? fallbackColor,
  ).dot;
  const initialHsv = getPickerHsv(selectedColor);
  const [pickerHsv, setPickerHsv] = useState(initialHsv);

  useEffect(() => {
    setPickerHsv(getPickerHsv(selectedColor));
  }, [selectedColor]);

  const updateHue = (hue: number) => {
    const nextHsv = [hue, pickerHsv[1], pickerHsv[2]] as [
      number,
      number,
      number,
    ];
    const normalizedColor = normalizeLabelPickerColor(hsvToHex(...nextHsv));
    const nextKey = getClosestLabelColorKey(normalizedColor);

    setPickerHsv(nextHsv);
    onChange(nextKey);
  };

  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {t("Color")}
      </Text>
      <VisuallyHidden id={descriptionId}>
        {t("Color brightness is limited between {{min}}% and {{max}}%.", {
          min: LABEL_COLOR_PICKER_MIN_BRIGHTNESS,
          max: LABEL_COLOR_PICKER_MAX_BRIGHTNESS,
        })}
      </VisuallyHidden>
      <Group gap="sm" align="flex-start" wrap="wrap">
        <ColorSwatch
          component="span"
          color={selectedColor}
          size={32}
          radius="sm"
          role="img"
          aria-label={t("Selected color")}
        />
        <HueSlider
          value={pickerHsv[0]}
          onChange={updateHue}
          aria-describedby={descriptionId}
          aria-label={t("Hue")}
          style={{ flex: "1 1 220px", minWidth: 220, marginTop: 7 }}
        />
      </Group>
    </div>
  );
}
