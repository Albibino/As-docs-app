import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createInstance } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enUS from "../../../../public/locales/en-US/translation.json";
import ptBR from "../../../../public/locales/pt-BR/translation.json";
import { useDeletePageModal } from "./use-delete-page-modal";

const { openConfirmModal } = vi.hoisted(() => ({
  openConfirmModal: vi.fn(),
}));

vi.mock("@mantine/modals", () => ({
  modals: { openConfirmModal },
}));

async function createI18n() {
  const i18n = createInstance();

  await i18n.use(initReactI18next).init({
    fallbackLng: "en-US",
    lng: "pt-BR",
    showSupportNotice: false,
    resources: {
      "en-US": { translation: enUS },
      "pt-BR": { translation: ptBR },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return i18n;
}

describe("useDeletePageModal", () => {
  beforeEach(() => {
    openConfirmModal.mockReset();
  });

  it("shows the translated fixed retention notice before moving a page to trash", async () => {
    const i18n = await createI18n();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    );
    const { result } = renderHook(() => useDeletePageModal(), { wrapper });

    result.current.openDeleteModal({ onConfirm: vi.fn() });

    const [options] = openConfirmModal.mock.calls[0] ?? [];
    const content = options?.children as { props: { children: unknown } };

    expect(content.props.children).toBe(
      "As páginas na lixeira serão excluídas permanentemente após 30 dias.",
    );
  });
});
