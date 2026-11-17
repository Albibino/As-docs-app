import { Modal, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms";
import HistoryModalBody from "@/features/page-history/components/history-modal-body";
import HistoryModalMobile from "@/features/page-history/components/history-modal-mobile";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@mantine/hooks";

interface Props {
  pageId: string;
  pageTitle?: string;
}

export default function HistoryModal({ pageId, pageTitle }: Props) {
  const { t } = useTranslation();
  const [isModalOpen, setModalOpen] = useAtom(historyAtoms);
  const isMobile = useMediaQuery("(max-width: 800px)");

  if (isMobile) {
    return (
      <Modal.Root
        opened={isModalOpen}
        onClose={() => setModalOpen(false)}
        fullScreen
        aria-label={t("Page history")}
        styles={{ content: { overflow: "hidden" } }}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>
              <Text size="md" fw={500}>
                {t("Page history")}
              </Text>
            </Modal.Title>
            <Modal.CloseButton aria-label={t("Close")} />
          </Modal.Header>
          <Modal.Body
            p={0}
            style={{ height: "calc(100vh - 60px)", overflow: "hidden" }}
          >
            <HistoryModalMobile pageId={pageId} pageTitle={pageTitle} />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    );
  }

  return (
    <Modal.Root
      size={1400}
      centered
      opened={isModalOpen}
      onClose={() => setModalOpen(false)}
      aria-label={t("Page history")}
      styles={{
        inner: {
          justifyContent: "center",
          alignItems: "center",
          paddingInline: "1rem",
          paddingBlock: "1.5rem",
          overflowY: "auto",
        },
        // TCC: o layout do conteúdo fica em `styles.content`, e não no `style`
        // do Modal.Content. O Mantine 9 repassa esse `style` também ao
        // `inner`, que então virava coluna com altura limitada e empurrava o
        // modal para cima, cortando o cabeçalho em telas altas.
        content: {
          marginInline: "auto",
          width: "min(1400px, calc(100vw - 2rem))",
          maxWidth: "calc(100vw - 2rem)",
          display: "flex",
          flexDirection: "column",
          height: "min(900px, calc(100dvh - 3rem))",
          maxHeight: "calc(100dvh - 3rem)",
          overflow: "hidden",
        },
      }}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            <Text size="md" fw={500}>
              {t("Page history")}
            </Text>
          </Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body p={0} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <HistoryModalBody pageId={pageId} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
