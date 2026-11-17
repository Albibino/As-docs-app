import { atomWithWebStorage } from "@/lib/jotai-helper.ts";
import { atom } from "jotai";

export const mobileSidebarAtom = atom<boolean>(false);

export const desktopSidebarAtom = atomWithWebStorage<boolean>(
  "showSidebar",
  true,
);

export const desktopAsideAtom = atom<boolean>(false);

// Valid `tab` values: "" | "comments" | "toc" | "chat" | "details"
type AsideStateType = {
  tab: string;
  isAsideOpen: boolean;
};

export const asideStateAtom = atom<AsideStateType>({
  tab: "",
  isAsideOpen: false,
});

export const sidebarWidthAtom = atomWithWebStorage<number>('sidebarWidth', 300);

export const spaceSidebarCollapsedAtom = atomWithWebStorage<boolean>(
  'spaceSidebarCollapsed',
  false,
);

export const globalSidebarWidthAtom = atomWithWebStorage<number>(
  'globalSidebarWidth',
  300,
);

export const globalSidebarCollapsedAtom = atomWithWebStorage<boolean>(
  'globalSidebarCollapsed',
  false,
);

export const SIDEBAR_COLLAPSED_WIDTH = 64;
export const SIDEBAR_COLLAPSE_THRESHOLD = 160;

// TCC: seção "Conversas" (chats da IA) da barra lateral, recolhida por padrão.
export const sidebarChatsOpenAtom = atomWithWebStorage<boolean>(
  "sidebarChatsOpen",
  false,
);
