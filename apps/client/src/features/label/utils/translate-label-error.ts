type LabelTranslation = (key: string) => string;

type LabelI18n = {
  exists: (key: string, options?: { lng?: string }) => boolean;
};

type BackendError = {
  response?: {
    data?: {
      message?: unknown;
    };
  };
};

function getBackendMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const message = (error as BackendError).response?.data?.message;
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

export function translateLabelApiError(
  error: unknown,
  t: LabelTranslation,
  i18n: LabelI18n,
  fallbackKey: string,
): string {
  const backendMessage = getBackendMessage(error);

  if (
    backendMessage &&
    (i18n.exists(backendMessage) || i18n.exists(backendMessage, { lng: "en-US" }))
  ) {
    return t(backendMessage);
  }

  return t(fallbackKey);
}
