import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelFolderImport,
  FolderImportResult,
  getFolderImport,
  retryFolderImport,
} from "./folder-import-service";
import {
  FolderImportScanResult,
  readFolderRootName,
  scanFolderImportFiles,
} from "./folder-import-scanner";
import { uploadFolderImport } from "./folder-import-uploader";
import { FolderImportPreview } from "./folder-import-preview";
import { FolderImportSelect } from "./folder-import-select";
import { FolderImportStatus } from "./folder-import-status";

type FlowStage =
  | "select"
  | "scanning"
  | "preview"
  | "uploading"
  | "processing"
  | "done";

export interface FolderImportFlowServices {
  scan: typeof scanFolderImportFiles;
  upload: typeof uploadFolderImport;
  get: typeof getFolderImport;
  retry: typeof retryFolderImport;
  cancel: typeof cancelFolderImport;
}

interface FolderImportFlowProps {
  spaceId: string;
  onBack: () => void;
  onImported?: () => void;
  services?: FolderImportFlowServices;
}

const defaultServices: FolderImportFlowServices = {
  scan: scanFolderImportFiles,
  upload: uploadFolderImport,
  get: getFolderImport,
  retry: retryFolderImport,
  cancel: cancelFolderImport,
};

export function FolderImportFlow({
  spaceId,
  onBack,
  onImported,
  services = defaultServices,
}: FolderImportFlowProps) {
  const { t } = useTranslation();
  const storageKey = useMemo(() => `docs-folder-import:${spaceId}`, [spaceId]);
  const [stage, setStage] = useState<FlowStage>("select");
  const [scan, setScan] = useState<FolderImportScanResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<FolderImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ completed: 0, total: 0 });
  const [discarding, setDiscarding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    uploaded: 0,
    total: 0,
  });
  const pendingUpload =
    result?.session.status === "uploading" ? result.session : null;

  const applyResult = useCallback(
    (next: FolderImportResult) => {
      setResult(next);
      setSessionId(next.session.id);
      if (next.session.status === "processing") setStage("processing");
      else if (next.session.status === "uploading") setStage("select");
      else {
        setStage("done");
        if (next.session.status === "success") onImported?.();
      }
    },
    [onImported],
  );

  useEffect(() => {
    const storedSessionId = readStoredSession(storageKey);
    if (!storedSessionId) return;
    setSessionId(storedSessionId);
    services
      .get(storedSessionId)
      .then(applyResult)
      .catch(() => window.localStorage.removeItem(storageKey));
  }, [applyResult, services, storageKey]);

  useEffect(() => {
    if (stage !== "processing" || !sessionId) return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await services.get(sessionId);
        if (!disposed) applyResult(next);
      } catch (pollError) {
        if (!disposed)
          setError(
            errorMessage(pollError, t("Unable to check import progress")),
          );
      }
      if (!disposed) timeout = setTimeout(poll, 2_000);
    };
    timeout = setTimeout(poll, 1_500);
    return () => {
      disposed = true;
      clearTimeout(timeout);
    };
  }, [applyResult, services, sessionId, stage, t]);

  const mismatchMessage = t(
    "Choose the same folder to resume this upload, or discard it to start a new import.",
  );

  const selectFiles = async (files: File[]) => {
    setError(null);
    if (pendingUpload) {
      const rootName = readFolderRootName(files);
      if (rootName && rootName !== pendingUpload.fileName) {
        setError(mismatchMessage);
        return;
      }
    }
    setStage("scanning");
    try {
      const next = await services.scan(files, { onProgress: setScanProgress });
      if (pendingUpload && next.rootName !== pendingUpload.fileName) {
        throw new Error(mismatchMessage);
      }
      setScan(next);
      setStage("preview");
    } catch (scanError) {
      setError(errorMessage(scanError, t("Unable to read this folder")));
      setStage("select");
    }
  };

  const confirm = async () => {
    if (!scan) return;
    setStage("uploading");
    setError(null);
    try {
      const uploaded = await services.upload(scan, spaceId, {
        existingSessionId:
          result?.session.status === "uploading"
            ? result.session.id
            : undefined,
        onSessionCreated: (id) => {
          setSessionId(id);
          window.localStorage.setItem(storageKey, id);
        },
        onProgress: setUploadProgress,
      });
      setSessionId(uploaded.session.id);
      window.localStorage.setItem(storageKey, uploaded.session.id);
      setStage("processing");
    } catch (uploadError) {
      setError(errorMessage(uploadError, t("Unable to upload this folder")));
      setStage("select");
    }
  };

  const cancel = async () => {
    if (!sessionId) return;
    try {
      applyResult(await services.cancel(sessionId));
    } catch (cancelError) {
      setError(errorMessage(cancelError, t("Unable to cancel this import")));
    }
  };

  const retry = async () => {
    if (!sessionId) return;
    setStage("processing");
    setError(null);
    try {
      await services.retry(sessionId);
    } catch (retryError) {
      setError(errorMessage(retryError, t("Unable to retry this import")));
      setStage("done");
    }
  };

  const reset = () => {
    window.localStorage.removeItem(storageKey);
    setScan(null);
    setSessionId(null);
    setResult(null);
    setError(null);
    setStage("select");
  };

  const discard = async () => {
    setDiscarding(true);
    let discardError: unknown = null;
    try {
      if (sessionId) await services.cancel(sessionId);
    } catch (cancelError) {
      discardError = cancelError;
    }
    setDiscarding(false);
    reset();
    if (discardError)
      setError(errorMessage(discardError, t("Unable to cancel this import")));
  };

  if (stage === "preview" && scan) {
    return (
      <FolderImportPreview scan={scan} onBack={reset} onConfirm={confirm} />
    );
  }
  if (["uploading", "processing", "done"].includes(stage)) {
    return (
      <FolderImportStatus
        stage={stage as "uploading" | "processing" | "done"}
        uploadProgress={uploadProgress}
        result={result}
        onCancel={cancel}
        onRetry={retry}
        onNewImport={reset}
      />
    );
  }
  return (
    <FolderImportSelect
      scanning={stage === "scanning"}
      progress={scanProgress}
      resumeName={pendingUpload?.fileName}
      discarding={discarding}
      error={error}
      onFiles={selectFiles}
      onDiscard={pendingUpload ? discard : undefined}
      onBack={onBack}
    />
  );
}

function readStoredSession(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  const responseMessage = (
    error as { response?: { data?: { message?: unknown } } }
  )?.response?.data?.message;
  return typeof responseMessage === "string" ? responseMessage : fallback;
}
