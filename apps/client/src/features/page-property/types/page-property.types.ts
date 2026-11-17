export type PagePropertyType = "date" | "number" | "person";
export type PagePropertyId = `prop:${string}`;

export type DatePagePropertyConfig = Record<string, never>;
export type NumberPagePropertyConfig = Record<string, never>;
export type PersonPagePropertyConfig = { allowMultiple: boolean };

export type PagePropertyConfig =
  | DatePagePropertyConfig
  | NumberPagePropertyConfig
  | PersonPagePropertyConfig;

export type PagePropertyValue = string | number | string[] | null;

export interface PagePropertyDefinition {
  id: string;
  basePropertyId: PagePropertyId;
  workspaceId: string;
  spaceId: string | null;
  name: string;
  type: PagePropertyType;
  config: PagePropertyConfig;
  position: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPagePropertyValue {
  pageId: string;
  propertyId: string;
  value: Exclude<PagePropertyValue, null>;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toBasePropertyId(definitionId: string): PagePropertyId {
  return `prop:${definitionId}`;
}

export function withBasePropertyId(
  definition: Omit<PagePropertyDefinition, "basePropertyId">,
): PagePropertyDefinition {
  return { ...definition, basePropertyId: toBasePropertyId(definition.id) };
}

export function normalizePagePropertyValue(
  definition: Pick<PagePropertyDefinition, "type" | "config">,
  value: PagePropertyValue,
): PagePropertyValue {
  if (
    definition.type !== "person" ||
    !("allowMultiple" in definition.config) ||
    !definition.config.allowMultiple ||
    value === null ||
    Array.isArray(value)
  ) {
    return value;
  }

  return typeof value === "string" ? [value] : value;
}
