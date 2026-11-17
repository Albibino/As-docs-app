import api from "@/lib/api-client";
import {
  PagePropertyConfig,
  PagePropertyDefinition,
  PagePropertyType,
  PagePropertyValue,
  StoredPagePropertyValue,
  withBasePropertyId,
} from "../types/page-property.types";

type DefinitionResponse = Omit<PagePropertyDefinition, "basePropertyId">;

const mapDefinition = (definition: DefinitionResponse) => {
  let config = definition.config;
  if (typeof config === "string") {
    try {
      config = JSON.parse(config) as PagePropertyConfig;
    } catch {
      config = {};
    }
  }
  return withBasePropertyId({ ...definition, config });
};

export async function listPagePropertyDefinitions(spaceId: string) {
  const response = await api.post<DefinitionResponse[]>(
    "/page-properties/definitions/list",
    { spaceId },
  );
  return response.data.map(mapDefinition);
}

export async function listWorkspacePagePropertyDefinitions() {
  const response = await api.post<DefinitionResponse[]>(
    "/page-properties/definitions/workspace/list",
  );
  return response.data.map(mapDefinition);
}

export async function createPagePropertyDefinition(input: {
  spaceId: string;
  name: string;
  type: PagePropertyType;
  config?: PagePropertyConfig;
}) {
  const response = await api.post<DefinitionResponse>(
    "/page-properties/definitions/create",
    input,
  );
  return mapDefinition(response.data);
}

export async function createWorkspacePagePropertyDefinition(input: {
  name: string;
  type: PagePropertyType;
  config?: PagePropertyConfig;
}) {
  const response = await api.post<DefinitionResponse>(
    "/page-properties/definitions/workspace/create",
    input,
  );
  return mapDefinition(response.data);
}

export async function updatePagePropertyDefinition(input: {
  propertyId: string;
  name?: string;
  config?: PagePropertyConfig;
  position?: number;
}) {
  const response = await api.post<DefinitionResponse>(
    "/page-properties/definitions/update",
    input,
  );
  return mapDefinition(response.data);
}

export async function deletePagePropertyDefinition(propertyId: string) {
  await api.post("/page-properties/definitions/delete", { propertyId });
}

export async function getPagePropertyValues(pageId: string) {
  const response = await api.post<StoredPagePropertyValue[]>(
    "/page-properties/values/get",
    { pageId },
  );
  return response.data.map((stored) => {
    if (typeof stored.value !== "string") return stored;
    try {
      return { ...stored, value: JSON.parse(stored.value) };
    } catch {
      return stored;
    }
  });
}

export async function setPagePropertyValue(input: {
  pageId: string;
  propertyId: string;
  value: PagePropertyValue;
}) {
  const response = await api.post<
    | StoredPagePropertyValue
    | {
        pageId: string;
        propertyId: string;
        value: null;
      }
  >("/page-properties/values/set", input);
  return response.data;
}
