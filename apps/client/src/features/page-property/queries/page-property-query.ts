import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createPagePropertyDefinition,
  createWorkspacePagePropertyDefinition,
  deletePagePropertyDefinition,
  getPagePropertyValues,
  listPagePropertyDefinitions,
  listWorkspacePagePropertyDefinitions,
  setPagePropertyValue,
  updatePagePropertyDefinition,
} from "../services/page-property-service";

export const pagePropertyDefinitionKey = (spaceId: string) =>
  ["page-property-definitions", spaceId] as const;
export const pagePropertyValueKey = (pageId: string) =>
  ["page-property-values", pageId] as const;
export const workspacePagePropertyDefinitionKey = [
  "workspace-page-property-definitions",
] as const;
function getMutationErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const response = error.response as { data?: { message?: string } };
    return response.data?.message ?? fallback;
  }
  return fallback;
}

export function usePagePropertyDefinitionsQuery(spaceId: string) {
  return useQuery({
    queryKey: pagePropertyDefinitionKey(spaceId),
    queryFn: () => listPagePropertyDefinitions(spaceId),
    enabled: Boolean(spaceId),
  });
}

export function useWorkspacePagePropertyDefinitionsQuery(enabled = true) {
  return useQuery({
    queryKey: workspacePagePropertyDefinitionKey,
    queryFn: listWorkspacePagePropertyDefinitions,
    enabled,
  });
}

export function usePagePropertyValuesQuery(pageId: string) {
  return useQuery({
    queryKey: pagePropertyValueKey(pageId),
    queryFn: () => getPagePropertyValues(pageId),
    enabled: Boolean(pageId),
  });
}

export function useCreatePagePropertyDefinitionMutation(spaceId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: createPagePropertyDefinition,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: pagePropertyDefinitionKey(spaceId),
        }),
        queryClient.invalidateQueries({ queryKey: ["bases"] }),
        queryClient.invalidateQueries({ queryKey: ["base-aggregate"] }),
      ]),
    onError: (error) =>
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to create page property"),
        ),
      }),
  });
}

export function useCreateWorkspacePagePropertyDefinitionMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: createWorkspacePagePropertyDefinition,
    onSuccess: () => invalidateWorkspaceDefinitions(queryClient),
    onError: (error) =>
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to create page property"),
        ),
      }),
  });
}

function invalidateWorkspaceDefinitions(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: workspacePagePropertyDefinitionKey,
    }),
    queryClient.invalidateQueries({ queryKey: ["page-property-definitions"] }),
    queryClient.invalidateQueries({ queryKey: ["bases"] }),
    queryClient.invalidateQueries({ queryKey: ["base-aggregate"] }),
  ]);
}

export function useUpdateWorkspacePagePropertyDefinitionMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: updatePagePropertyDefinition,
    onSuccess: () => invalidateWorkspaceDefinitions(queryClient),
    onError: (error) =>
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to update page property"),
        ),
      }),
  });
}

export function useDeleteWorkspacePagePropertyDefinitionMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: deletePagePropertyDefinition,
    onSuccess: () => invalidateWorkspaceDefinitions(queryClient),
    onError: (error) =>
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to delete page property"),
        ),
      }),
  });
}

export function useUpdatePagePropertyDefinitionMutation(spaceId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: updatePagePropertyDefinition,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: pagePropertyDefinitionKey(spaceId),
        }),
        queryClient.invalidateQueries({ queryKey: ["bases"] }),
        queryClient.invalidateQueries({ queryKey: ["base-aggregate"] }),
      ]),
    onError: (error) =>
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to update page property"),
        ),
      }),
  });
}

export function useDeletePagePropertyDefinitionMutation(spaceId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: deletePagePropertyDefinition,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: pagePropertyDefinitionKey(spaceId),
        }),
        queryClient.invalidateQueries({ queryKey: ["bases"] }),
        queryClient.invalidateQueries({ queryKey: ["base-aggregate"] }),
      ]),
    onError: (error) =>
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to delete page property"),
        ),
      }),
  });
}

export function useSetPagePropertyValueMutation(pageId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: setPagePropertyValue,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: pagePropertyValueKey(pageId),
        }),
        queryClient.invalidateQueries({ queryKey: ["base-rows"] }),
        queryClient.invalidateQueries({ queryKey: ["base-aggregate"] }),
      ]),
    onError: (error) => {
      void queryClient.invalidateQueries({
        queryKey: pagePropertyValueKey(pageId),
      });
      notifications.show({
        color: "red",
        message: getMutationErrorMessage(
          error,
          t("Failed to update page property value"),
        ),
      });
    },
  });
}
