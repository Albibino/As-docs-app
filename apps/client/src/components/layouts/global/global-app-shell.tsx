import { AppShell, Container } from "@mantine/core";
import React, { useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsSidebar from "@/components/settings/settings-sidebar.tsx";
import { useAtom } from "jotai";
import {
  asideStateAtom,
  desktopSidebarAtom,
  globalSidebarCollapsedAtom,
  globalSidebarWidthAtom,
  mobileSidebarAtom,
  sidebarWidthAtom,
  spaceSidebarCollapsedAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { SpaceSidebar } from "@/features/space/components/sidebar/space-sidebar.tsx";
import { AppHeader } from "@/components/layouts/global/app-header.tsx";
import Aside from "@/components/layouts/global/aside.tsx";
import classes from "./app-shell.module.css";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { useSidebarResize } from "@/components/layouts/global/hooks/hooks/use-sidebar-resize.ts";
import GlobalSidebar from "@/components/layouts/global/global-sidebar.tsx";
import { ASIDE_PANEL_ID } from "@/hooks/use-toggle-aside.tsx";
import { MAIN_CONTENT_ID, SkipToMain } from "@/components/ui/skip-to-main.tsx";

export default function GlobalAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const [{ isAsideOpen, tab: asideTab }] = useAtom(asideStateAtom);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const spaceSidebar = useSidebarResize(
    sidebarWidthAtom,
    spaceSidebarCollapsedAtom,
    sidebarRef,
    { minWidth: 220, maxWidth: 600 },
  );
  const globalSidebar = useSidebarResize(
    globalSidebarWidthAtom,
    globalSidebarCollapsedAtom,
    sidebarRef,
    { minWidth: 220, maxWidth: 480 },
  );

  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const isSpaceSettingsRoute = /^\/s\/[^/]+\/settings(?:\/|$)/.test(
    location.pathname,
  );
  const isLabelsSettingsRoute =
    location.pathname === "/settings/labels" ||
    /^\/s\/[^/]+\/settings\/labels$/.test(location.pathname);
  const isSpaceRoute =
    location.pathname.startsWith("/s/") && !isSpaceSettingsRoute;
  const isSettingsLayoutRoute = isSettingsRoute || isSpaceSettingsRoute;
  const isPageRoute = location.pathname.includes("/p/");
  const showGlobalSidebar = !isSpaceRoute && !isSettingsLayoutRoute;

  return (
    <>
      <SkipToMain />
      <AppShell
        header={{ height: 45 }}
        navbar={{
          width: isSpaceRoute
            ? spaceSidebar.width
            : showGlobalSidebar
              ? globalSidebar.width
              : 300,
          breakpoint: "sm",
          collapsed: {
            mobile: !mobileOpened,
            desktop: !desktopOpened,
          },
        }}
        aside={
          isPageRoute && {
            width: 350,
            breakpoint: "sm",
            collapsed: { mobile: !isAsideOpen, desktop: !isAsideOpen },
          }
        }
        padding="md"
      >
        <AppShell.Header px="md" className={classes.header}>
          <AppHeader />
        </AppShell.Header>
        <AppShell.Navbar
          className={classes.navbar}
          data-collapsed={
            (isSpaceRoute && spaceSidebar.collapsed) ||
            (showGlobalSidebar && globalSidebar.collapsed) ||
            undefined
          }
          withBorder={false}
          ref={sidebarRef}
          aria-label={
            isSpaceRoute
              ? t("Space navigation")
              : isSettingsLayoutRoute
                ? t("Settings navigation")
                : t("Main navigation")
          }
        >
          {isSpaceRoute && (
            <div
              className={classes.resizeHandle}
              data-collapsed={spaceSidebar.collapsed || undefined}
              onPointerDown={spaceSidebar.startResizing}
              onPointerMove={spaceSidebar.resize}
              onPointerUp={spaceSidebar.stopResizing}
              onPointerCancel={spaceSidebar.stopResizing}
              onDoubleClick={spaceSidebar.toggleCollapsed}
            />
          )}
          {isSpaceRoute && <SpaceSidebar collapsed={spaceSidebar.collapsed} />}
          {isSpaceSettingsRoute && <SettingsSidebar scope="space" />}
          {isSettingsRoute && <SettingsSidebar />}
          {showGlobalSidebar && (
            <div
              className={classes.resizeHandle}
              data-collapsed={globalSidebar.collapsed || undefined}
              onPointerDown={globalSidebar.startResizing}
              onPointerMove={globalSidebar.resize}
              onPointerUp={globalSidebar.stopResizing}
              onPointerCancel={globalSidebar.stopResizing}
              onDoubleClick={globalSidebar.toggleCollapsed}
            />
          )}
          {showGlobalSidebar && (
            <GlobalSidebar collapsed={globalSidebar.collapsed} />
          )}
        </AppShell.Navbar>
        <AppShell.Main id={MAIN_CONTENT_ID} tabIndex={-1}>
          {isSettingsLayoutRoute ? (
            <Container size={isLabelsSettingsRoute ? 1100 : 900} pb={80}>
              {children}
            </Container>
          ) : (
            children
          )}
        </AppShell.Main>

        {isPageRoute && (
          <AppShell.Aside
            id={ASIDE_PANEL_ID}
            tabIndex={-1}
            className={classes.aside}
            p="md"
            withBorder={false}
            aria-label={
              asideTab === "comments"
                ? t("Comments")
                : asideTab === "toc"
                  ? t("Table of contents")
                  : asideTab === "chat"
                    ? t("AI Chat")
                    : asideTab === "details"
                      ? t("Details")
                      : undefined
            }
          >
            <Aside />
          </AppShell.Aside>
        )}
      </AppShell>
    </>
  );
}
