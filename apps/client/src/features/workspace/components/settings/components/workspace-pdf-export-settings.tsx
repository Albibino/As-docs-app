import {
  Button,
  ColorInput,
  Divider,
  FileInput,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import {
  deletePdfExportAsset,
  updateWorkspace,
  uploadPdfExportAsset,
} from "@/features/workspace/services/workspace-service.ts";
import { IPdfExportThemeSettings } from "@/features/workspace/types/workspace.types.ts";
import useUserRole from "@/hooks/use-user-role.tsx";

const DEFAULT_PDF_EXPORT_THEME: IPdfExportThemeSettings = {
  page: {
    size: "A4",
    margins: { top: 25, right: 25, bottom: 25, left: 30 },
    fontFamily: "Calibri",
    fontSize: 12,
    lineHeight: 1.15,
    backgroundAsset: null,
    backgroundAssetId: null,
  },
  colors: {
    primary: "#00A8B5",
    secondary: "#6F6F6F",
    text: "#000000",
    coverBackground: "#FFFFFF",
    coverText: "#000000",
    tableHeaderBackground: "#00A8B5",
    tableHeaderText: "#FFFFFF",
  },
  title: {
    fontSize: 26,
    uppercase: true,
    color: "#000000",
    alignment: "left",
  },
  headings: {
    fontSize: 14,
    uppercase: true,
    color: "#00A8B5",
  },
  cover: { enabled: true, backgroundAsset: null, backgroundAssetId: null },
  footer: { showPageNumber: false },
};

function mergePdfExportTheme(
  value: IPdfExportThemeSettings | string | undefined,
): IPdfExportThemeSettings {
  let parsedValue: IPdfExportThemeSettings | undefined = value as
    | IPdfExportThemeSettings
    | undefined;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value) as IPdfExportThemeSettings;
    } catch {
      parsedValue = undefined;
    }
  }

  return {
    page: {
      ...DEFAULT_PDF_EXPORT_THEME.page,
      ...parsedValue?.page,
      margins: {
        ...DEFAULT_PDF_EXPORT_THEME.page.margins,
        ...parsedValue?.page?.margins,
      },
    },
    colors: { ...DEFAULT_PDF_EXPORT_THEME.colors, ...parsedValue?.colors },
    title: { ...DEFAULT_PDF_EXPORT_THEME.title, ...parsedValue?.title },
    headings: {
      ...DEFAULT_PDF_EXPORT_THEME.headings,
      ...parsedValue?.headings,
    },
    cover: { ...DEFAULT_PDF_EXPORT_THEME.cover, ...parsedValue?.cover },
    footer: {
      showPageNumber:
        parsedValue?.footer?.showPageNumber ??
        DEFAULT_PDF_EXPORT_THEME.footer.showPageNumber,
    },
  };
}

export default function WorkspacePdfExportSettings() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState(() =>
    mergePdfExportTheme(workspace?.settings?.pdfExport),
  );
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [pageBackgroundImageFile, setPageBackgroundImageFile] =
    useState<File | null>(null);
  const persistedCoverImageFile = useMemo(() => {
    if (!theme.cover.backgroundAssetId) return null;

    return new File([], theme.cover.backgroundAssetName || t("Saved image"));
  }, [theme.cover.backgroundAssetId, theme.cover.backgroundAssetName, t]);
  const persistedPageBackgroundImageFile = useMemo(() => {
    if (!theme.page.backgroundAssetId) return null;

    return new File(
      [],
      theme.page.backgroundAssetName || t("Saved image"),
    );
  }, [theme.page.backgroundAssetId, theme.page.backgroundAssetName, t]);
  const savedCoverImage = useRef<{ file: File; assetId: string } | null>(null);
  const savedPageBackgroundImage = useRef<{
    file: File;
    assetId: string;
  } | null>(null);

  useEffect(() => {
    setTheme(mergePdfExportTheme(workspace?.settings?.pdfExport));
  }, [workspace?.id, workspace?.settings?.pdfExport]);

  useEffect(() => {
    setCoverImageFile(null);
    setPageBackgroundImageFile(null);
    savedCoverImage.current = null;
    savedPageBackgroundImage.current = null;
  }, [workspace?.id]);

  const updatePage = (key: keyof IPdfExportThemeSettings["page"], value: unknown) => {
    setTheme((current) => ({
      ...current,
      page: { ...current.page, [key]: value },
    }));
  };

  const updateMargin = (
    key: keyof IPdfExportThemeSettings["page"]["margins"],
    value: number,
  ) => {
    setTheme((current) => ({
      ...current,
      page: {
        ...current.page,
        margins: { ...current.page.margins, [key]: value },
      },
    }));
  };

  const updateColor = (
    key: keyof IPdfExportThemeSettings["colors"],
    value: string,
  ) => {
    setTheme((current) => ({
      ...current,
      colors: { ...current.colors, [key]: value },
    }));
  };

  const updateTitle = (
    key: keyof IPdfExportThemeSettings["title"],
    value: unknown,
  ) => {
    setTheme((current) => ({
      ...current,
      title: { ...current.title, [key]: value },
    }));
  };

  const updateHeadings = (
    key: keyof IPdfExportThemeSettings["headings"],
    value: unknown,
  ) => {
    setTheme((current) => ({
      ...current,
      headings: { ...current.headings, [key]: value },
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    const uploadedAssetIds: string[] = [];
    const previousTheme = mergePdfExportTheme(workspace?.settings?.pdfExport);
    let newlySavedCoverImage: { file: File; assetId: string } | null = null;
    let newlySavedPageBackgroundImage: {
      file: File;
      assetId: string;
    } | null = null;
    const nextTheme: IPdfExportThemeSettings = {
      ...theme,
      page: { ...theme.page },
      cover: { ...theme.cover },
      footer: { ...theme.footer },
    };

    try {
      if (
        coverImageFile &&
        (!savedCoverImage.current ||
          savedCoverImage.current.file !== coverImageFile ||
          savedCoverImage.current.assetId !==
            previousTheme.cover.backgroundAssetId)
      ) {
        const { assetId } = await uploadPdfExportAsset(coverImageFile);
        uploadedAssetIds.push(assetId);
        nextTheme.cover.backgroundAsset = null;
        nextTheme.cover.backgroundAssetId = assetId;
        nextTheme.cover.backgroundAssetName = coverImageFile.name.slice(0, 255);
        newlySavedCoverImage = { file: coverImageFile, assetId };
      }
      if (
        pageBackgroundImageFile &&
        (!savedPageBackgroundImage.current ||
          savedPageBackgroundImage.current.file !== pageBackgroundImageFile ||
          savedPageBackgroundImage.current.assetId !==
            previousTheme.page.backgroundAssetId)
      ) {
        const { assetId } = await uploadPdfExportAsset(pageBackgroundImageFile);
        uploadedAssetIds.push(assetId);
        nextTheme.page.backgroundAsset = null;
        nextTheme.page.backgroundAssetId = assetId;
        nextTheme.page.backgroundAssetName = pageBackgroundImageFile.name.slice(
          0,
          255,
        );
        newlySavedPageBackgroundImage = {
          file: pageBackgroundImageFile,
          assetId,
        };
      }

      const updatedWorkspace = await updateWorkspace({ pdfExport: nextTheme });
      setWorkspace(updatedWorkspace);
      setTheme(nextTheme);
      if (newlySavedCoverImage) {
        savedCoverImage.current = newlySavedCoverImage;
      }
      if (newlySavedPageBackgroundImage) {
        savedPageBackgroundImage.current = newlySavedPageBackgroundImage;
      }

      const previousAssetIds = [
        previousTheme.cover.backgroundAssetId,
        previousTheme.page.backgroundAssetId,
      ];
      const retainedAssetIds = new Set([
        nextTheme.cover.backgroundAssetId,
        nextTheme.page.backgroundAssetId,
      ]);
      await Promise.allSettled(
        [...new Set(previousAssetIds)]
          .filter((assetId): assetId is string => Boolean(assetId))
          .filter((assetId) => !retainedAssetIds.has(assetId))
          .map((assetId) => deletePdfExportAsset(assetId)),
      );

      notifications.show({ message: t("Updated successfully") });
    } catch {
      await Promise.allSettled(
        uploadedAssetIds.map((assetId) => deletePdfExportAsset(assetId)),
      );
      notifications.show({
        message: t("Failed to update data"),
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreDefaults = () => {
    setTheme(mergePdfExportTheme(undefined));
    setCoverImageFile(null);
    setPageBackgroundImageFile(null);
    savedCoverImage.current = null;
    savedPageBackgroundImage.current = null;
  };

  const removeCoverImage = () => {
    setCoverImageFile(null);
    savedCoverImage.current = null;
    setTheme((current) => ({
      ...current,
      cover: {
        ...current.cover,
        backgroundAsset: null,
        backgroundAssetId: null,
        backgroundAssetName: null,
      },
    }));
  };

  const removePageBackgroundImage = () => {
    setPageBackgroundImageFile(null);
    savedPageBackgroundImage.current = null;
    setTheme((current) => ({
      ...current,
      page: {
        ...current.page,
        backgroundAsset: null,
        backgroundAssetId: null,
        backgroundAssetName: null,
      },
    }));
  };

  const numberValue = (value: string | number) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return (
    <Stack gap="md">
      <div>
        <Text size="md" fw={500}>
          {t("PDF export appearance")}
        </Text>
        <Text size="sm" c="dimmed">
          {t("Customize the PDF exported from pages and spaces.")}
        </Text>
      </div>

      <Group grow align="flex-end">
        <Select
          label={t("Font")}
          data={["Arial", "Calibri", "Georgia", "Helvetica", "Times New Roman", "Verdana"]}
          value={theme.page.fontFamily}
          onChange={(value) => value && updatePage("fontFamily", value)}
          disabled={!isAdmin}
        />
        <NumberInput
          label={t("Body font size")}
          min={8}
          max={24}
          suffix=" pt"
          value={theme.page.fontSize}
          onChange={(value) => updatePage("fontSize", numberValue(value))}
          disabled={!isAdmin}
        />
        <NumberInput
          label={t("Line height")}
          min={1}
          max={2}
          step={0.05}
          decimalScale={2}
          value={theme.page.lineHeight}
          onChange={(value) => updatePage("lineHeight", numberValue(value))}
          disabled={!isAdmin}
        />
      </Group>

      <Text size="sm" fw={500}>
        {t("Margins (mm)")}
      </Text>
      <Group grow>
        {(["top", "right", "bottom", "left"] as const).map((key) => (
          <NumberInput
            key={key}
            label={t(`Margin ${key}`)}
            min={0}
            max={60}
            value={theme.page.margins[key]}
            onChange={(value) => updateMargin(key, numberValue(value))}
            disabled={!isAdmin}
          />
        ))}
      </Group>

      <Divider />
      <Text size="sm" fw={500}>
        {t("Colors")}
      </Text>
      <Group grow>
        <ColorInput
          label={t("Primary color")}
          value={theme.colors.primary}
          onChange={(value) => updateColor("primary", value)}
          disabled={!isAdmin}
        />
        <ColorInput
          label={t("Heading color")}
          value={theme.headings.color}
          onChange={(value) => updateHeadings("color", value)}
          disabled={!isAdmin}
        />
        <ColorInput
          label={t("Body text color")}
          value={theme.colors.text}
          onChange={(value) => updateColor("text", value)}
          disabled={!isAdmin}
        />
      </Group>
      <Group grow>
        <ColorInput
          label={t("Cover background color")}
          value={theme.colors.coverBackground}
          onChange={(value) => updateColor("coverBackground", value)}
          disabled={!isAdmin}
        />
        <ColorInput
          label={t("Cover text color")}
          value={theme.colors.coverText}
          onChange={(value) => updateColor("coverText", value)}
          disabled={!isAdmin}
        />
        <ColorInput
          label={t("Table header color")}
          value={theme.colors.tableHeaderBackground}
          onChange={(value) => updateColor("tableHeaderBackground", value)}
          disabled={!isAdmin}
        />
      </Group>

      <Divider />
      <Group grow align="flex-end">
        <NumberInput
          label={t("Title font size")}
          min={12}
          max={48}
          suffix=" pt"
          value={theme.title.fontSize}
          onChange={(value) => updateTitle("fontSize", numberValue(value))}
          disabled={!isAdmin}
        />
        <Select
          label={t("Title alignment")}
          data={[
            { value: "left", label: t("Left") },
            { value: "center", label: t("Center") },
            { value: "right", label: t("Right") },
          ]}
          value={theme.title.alignment}
          onChange={(value) => value && updateTitle("alignment", value)}
          disabled={!isAdmin}
        />
        <Switch
          label={t("Uppercase title")}
          checked={theme.title.uppercase}
          onChange={(event) =>
            updateTitle("uppercase", event.currentTarget.checked)
          }
          disabled={!isAdmin}
        />
      </Group>
      <Group grow align="flex-end">
        <Stack gap="xs">
          <FileInput
            label={t("Upload cover background image")}
            description={t(
              "Choose a PNG or JPEG up to 10 MB. It is stored in this workspace when you click Save.",
            )}
            accept="image/png,image/jpeg"
            value={coverImageFile ?? persistedCoverImageFile}
            onChange={setCoverImageFile}
            disabled={!isAdmin || isLoading}
            clearable={Boolean(coverImageFile)}
          />
          <Button
            variant="subtle"
            onClick={removeCoverImage}
            disabled={
              !isAdmin ||
              isLoading ||
              (!coverImageFile &&
                !theme.cover.backgroundAsset &&
                !theme.cover.backgroundAssetId)
            }
          >
            {t("Remove cover image")}
          </Button>
        </Stack>
        <Stack gap="xs">
          <FileInput
            label={t("Upload page background image")}
            description={t(
              "Choose a PNG or JPEG up to 10 MB. It is stored in this workspace when you click Save.",
            )}
            accept="image/png,image/jpeg"
            value={pageBackgroundImageFile ?? persistedPageBackgroundImageFile}
            onChange={setPageBackgroundImageFile}
            disabled={!isAdmin || isLoading}
            clearable={Boolean(pageBackgroundImageFile)}
          />
          <Button
            variant="subtle"
            onClick={removePageBackgroundImage}
            disabled={
              !isAdmin ||
              isLoading ||
              (!pageBackgroundImageFile &&
                !theme.page.backgroundAsset &&
                !theme.page.backgroundAssetId)
            }
          >
            {t("Remove page background image")}
          </Button>
        </Stack>
      </Group>
      <Group grow align="flex-end">
        <NumberInput
          label={t("Heading font size")}
          min={8}
          max={36}
          suffix=" pt"
          value={theme.headings.fontSize}
          onChange={(value) =>
            updateHeadings("fontSize", numberValue(value))
          }
          disabled={!isAdmin}
        />
        <Switch
          label={t("Uppercase headings")}
          checked={theme.headings.uppercase}
          onChange={(event) =>
            updateHeadings("uppercase", event.currentTarget.checked)
          }
          disabled={!isAdmin}
        />
      </Group>

      <Divider />
      <Group grow>
        <Switch
          label={t("Show cover")}
          checked={theme.cover.enabled}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            setTheme((current) => ({
              ...current,
              cover: { ...current.cover, enabled },
            }));
          }}
          disabled={!isAdmin}
        />
      </Group>
      <Group grow align="flex-end">
        <Switch
          label={t("Show page number")}
          checked={theme.footer.showPageNumber}
          onChange={(event) => {
            const showPageNumber = event.currentTarget.checked;
            setTheme((current) => ({
              ...current,
              footer: { showPageNumber },
            }));
          }}
          disabled={!isAdmin}
        />
      </Group>

      {isAdmin && (
        <Group>
          <Button
            variant="default"
            onClick={handleRestoreDefaults}
            disabled={isLoading}
          >
            {t("Restore defaults")}
          </Button>
          <Button onClick={handleSave} loading={isLoading} w="fit-content">
            {t("Save")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
