import {
  Loader,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpaceAssignableUsersQuery } from "@/features/space/queries/space-query";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query";
import {
  usePagePropertyDefinitionsQuery,
  usePagePropertyValuesQuery,
  useSetPagePropertyValueMutation,
} from "../queries/page-property-query";
import {
  normalizePagePropertyValue,
  PagePropertyDefinition,
  PagePropertyValue,
} from "../types/page-property.types";
import classes from "./page-properties-editor.module.css";

export type PagePropertiesEditorProps = {
  pageId: string;
  spaceId: string;
  editable?: boolean;
};

export function PagePropertiesEditor({
  pageId,
  spaceId,
  editable = false,
}: PagePropertiesEditorProps) {
  const { t } = useTranslation();
  const definitionsQuery = usePagePropertyDefinitionsQuery(spaceId);
  const valuesQuery = usePagePropertyValuesQuery(pageId);
  const setValueMutation = useSetPagePropertyValueMutation(pageId);
  const workspaceDefinitions = useMemo(
    () =>
      (definitionsQuery.data ?? []).filter(
        (definition) => definition.spaceId === null,
      ),
    [definitionsQuery.data],
  );
  const spaceDefinitions = useMemo(
    () =>
      (definitionsQuery.data ?? []).filter(
        (definition) => definition.spaceId !== null,
      ),
    [definitionsQuery.data],
  );

  const values = useMemo(
    () =>
      new Map(
        (valuesQuery.data ?? []).map((stored) => [
          stored.propertyId,
          stored.value,
        ]),
      ),
    [valuesQuery.data],
  );
  if (definitionsQuery.isLoading || valuesQuery.isLoading) {
    return <Loader size="sm" />;
  }
  if (definitionsQuery.isError || valuesQuery.isError) {
    return <Text c="red">{t("Failed to load page properties")}</Text>;
  }
  if (!definitionsQuery.data?.length) return null;

  const save = (
    definition: PagePropertyDefinition,
    value: PagePropertyValue,
  ) =>
    setValueMutation.mutate({
      pageId,
      propertyId: definition.id,
      value: normalizePagePropertyValue(definition, value),
    });

  return (
    <Stack gap="lg">
      <PagePropertySection
        title={t("Workspace fields")}
        description={t("Applied to every space in this workspace")}
        definitions={workspaceDefinitions}
        values={values}
        spaceId={null}
        editable={editable}
        mutation={setValueMutation}
        onSave={save}
      />
      <PagePropertySection
        title={t("Space fields")}
        description={t("Specific to this space")}
        definitions={spaceDefinitions}
        values={values}
        spaceId={spaceId}
        editable={editable}
        mutation={setValueMutation}
        onSave={save}
      />
    </Stack>
  );
}

function PagePropertySection({
  title,
  description,
  definitions,
  values,
  spaceId,
  editable,
  mutation,
  onSave,
}: {
  title: string;
  description: string;
  definitions: PagePropertyDefinition[];
  values: Map<string, PagePropertyValue>;
  spaceId: string | null;
  editable: boolean;
  mutation: ReturnType<typeof useSetPagePropertyValueMutation>;
  onSave: (
    definition: PagePropertyDefinition,
    value: PagePropertyValue,
  ) => void;
}) {
  if (definitions.length === 0) return null;

  return (
    <div className={classes.section}>
      <Stack gap="sm">
        <div>
          <Text className={classes.sectionTitle}>{title}</Text>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </div>
        {definitions.map((definition) => (
          <PagePropertyField
            key={definition.id}
            definition={definition}
            value={values.get(definition.id) ?? null}
            spaceId={spaceId}
            editable={editable}
            resetSignal={mutation.failureCount}
            saving={
              mutation.isPending &&
              mutation.variables?.propertyId === definition.id
            }
            onSave={(value) => onSave(definition, value)}
          />
        ))}
      </Stack>
    </div>
  );
}

function PagePropertyField({
  definition,
  value,
  spaceId,
  editable,
  resetSignal,
  saving,
  onSave,
}: {
  definition: PagePropertyDefinition;
  value: PagePropertyValue;
  spaceId: string | null;
  editable: boolean;
  resetSignal: number;
  saving: boolean;
  onSave: (value: PagePropertyValue) => void;
}) {
  const [draft, setDraft] = useState<string | number>(
    typeof value === "string" || typeof value === "number" ? value : "",
  );

  useEffect(() => {
    if (definition.type === "person") return;
    setDraft(
      typeof value === "string" || typeof value === "number" ? value : "",
    );
  }, [definition.type, resetSignal, value]);

  if (definition.type === "date") {
    return (
      <TextInput
        type="date"
        variant="unstyled"
        classNames={{ input: classes.input, label: classes.label }}
        label={definition.name}
        value={String(draft)}
        disabled={!editable || saving}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onSave(draft === "" ? null : String(draft))}
      />
    );
  }

  if (definition.type === "number") {
    return (
      <NumberInput
        variant="unstyled"
        hideControls
        classNames={{ input: classes.input, label: classes.label }}
        label={definition.name}
        value={draft}
        disabled={!editable || saving}
        onChange={(nextValue) =>
          setDraft(
            typeof nextValue === "bigint" ? Number(nextValue) : nextValue,
          )
        }
        onBlur={() =>
          onSave(
            typeof draft === "number" && Number.isFinite(draft) ? draft : null,
          )
        }
      />
    );
  }

  const allowMultiple =
    definition.config !== null &&
    typeof definition.config === "object" &&
    "allowMultiple" in definition.config &&
    definition.config.allowMultiple;

  if (definition.type === "person") {
    return (
      <PersonSelectField
        spaceId={spaceId}
        label={definition.name}
        allowMultiple={allowMultiple}
        value={value}
        editable={editable}
        saving={saving}
        onSave={onSave}
      />
    );
  }

  // TCC: só existem os tipos date, number e person (o tipo "customer"
  // dependia do diretório externo e foi removido).
  return null;
}

function PersonSelectField({
  spaceId,
  label,
  allowMultiple,
  value,
  editable,
  saving,
  onSave,
}: {
  spaceId: string | null;
  label: string;
  allowMultiple: boolean;
  value: PagePropertyValue;
  editable: boolean;
  saving: boolean;
  onSave: (value: PagePropertyValue) => void;
}) {
  const [search, setSearch] = useState("");
  const spaceUsersQuery = useSpaceAssignableUsersQuery(
    spaceId ?? "",
    search,
  );
  const workspaceMembersQuery = useWorkspaceMembersQuery(
    { limit: 50, query: search },
    spaceId === null,
  );
  const people = useMemo(() => {
    const source =
      spaceId === null ? workspaceMembersQuery.data : spaceUsersQuery.data;
    return (source?.items ?? [])
      .filter((member) => !member.deactivatedAt)
      .map((member) => ({
        value: member.id,
        label: member.name || member.email,
      }));
  }, [spaceId, spaceUsersQuery.data, workspaceMembersQuery.data]);

  if (allowMultiple) {
    return (
      <MultiSelect
        variant="unstyled"
        classNames={{ input: classes.input, label: classes.label }}
        label={label}
        data={people}
        searchable
        clearable
        onSearchChange={setSearch}
        disabled={!editable || saving}
        value={Array.isArray(value) ? value : []}
        onChange={(nextValue) => onSave(nextValue)}
      />
    );
  }

  return (
    <Select
      variant="unstyled"
      classNames={{ input: classes.input, label: classes.label }}
      label={label}
      data={people}
      searchable
      clearable
      onSearchChange={setSearch}
      disabled={!editable || saving}
      value={typeof value === "string" ? value : null}
      onChange={(nextValue) => onSave(nextValue)}
    />
  );
}
