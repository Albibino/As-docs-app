import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import CommentListWithTabs from "@/features/comment/components/comment-list-with-tabs.tsx";
import { useAtom } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import React, { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TableOfContents } from "@/features/editor/components/table-of-contents/table-of-contents.tsx";
import { useAtomValue } from "jotai";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import AsideAssistantPanel from "@/features/assistant/components/aside-assistant-panel";
import { PageDetailsAside } from "@/features/page-details/components/page-details-aside.tsx";
import { ASIDE_PANEL_ID } from "@/hooks/use-toggle-aside.tsx";
import { RelatedPagesList } from "@/features/page-details/components/related-pages-list.tsx";

export default function Aside() {
  const [{ tab, isAsideOpen }, setAsideState] = useAtom(asideStateAtom);
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);
  const [tocPanel, setTocPanel] = useState<"toc" | "related">("toc");
  const closeAside = () => setAsideState((s) => ({ ...s, isAsideOpen: false }));

  useEffect(() => {
    if (!isAsideOpen) return;
    document.getElementById(ASIDE_PANEL_ID)?.focus();
  }, [isAsideOpen, tab]);

  let title: string;
  let component: ReactNode;

  switch (tab) {
    case "comments":
      component = <CommentListWithTabs />;
      title = "Comments";
      break;
    case "toc":
      component = <TableOfContents editor={pageEditor} />;
      title = "Table of contents";
      break;
    case "chat":
      component = <AsideAssistantPanel />;
      title = "AI Chat";
      break;
    case "details":
      component = <PageDetailsAside />;
      title = "Details";
      break;
    default:
      component = null;
      title = null;
  }

  return (
    <Box
      p="md"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      {component && (
        <>
          {tab === "toc" ? (
            <ScrollArea
              style={{ flex: 1, minHeight: 0 }}
              scrollbarSize={5}
              type="scroll"
            >
              <Stack gap="md" pb="xl">
                <Group justify="space-between" wrap="nowrap">
                  <SegmentedControl
                    value={tocPanel}
                    onChange={(value) =>
                      setTocPanel(value as "toc" | "related")
                    }
                    data={[
                      { value: "toc", label: t(title) },
                      { value: "related", label: t("Related pages") },
                    ]}
                    size="xs"
                    fullWidth
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <Tooltip label={t("Close")} withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={closeAside}
                      aria-label={t("Close")}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Box role="tabpanel">
                  {tocPanel === "toc" ? (
                    component
                  ) : (
                    <RelatedPagesList enabled />
                  )}
                </Box>
              </Stack>
            </ScrollArea>
          ) : (
            tab !== "chat" && (
              <Group justify="space-between" wrap="nowrap" mb="md">
                <Title order={2} size="h6" fw={500}>
                  {t(title)}
                </Title>
                <Tooltip label={t("Close")} withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={closeAside}
                    aria-label={t("Close")}
                  >
                    <IconX size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )
          )}

          {tab === "toc" ? null : tab === "comments" || tab === "chat" ? (
            component
          ) : (
            <ScrollArea
              style={{ height: "85vh" }}
              scrollbarSize={5}
              type="scroll"
            >
              <div style={{ paddingBottom: "200px" }}>{component}</div>
            </ScrollArea>
          )}
        </>
      )}
    </Box>
  );
}
