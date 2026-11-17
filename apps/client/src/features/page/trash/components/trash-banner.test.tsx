import { cleanup, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { createInstance } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enUS from "../../../../../public/locales/en-US/translation.json";
import ptBR from "../../../../../public/locales/pt-BR/translation.json";
import { TrashBanner } from "./trash-banner";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderTrashBanner(language: string) {
  const i18n = createInstance();

  await i18n.use(initReactI18next).init({
    fallbackLng: "en-US",
    lng: language,
    showSupportNotice: false,
    resources: {
      "en-US": { translation: enUS },
      "pt-BR": { translation: ptBR },
      "de-DE": { translation: {} },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  render(
    <MantineProvider forceColorScheme="light">
      <I18nextProvider i18n={i18n}>
        <TrashBanner />
      </I18nextProvider>
    </MantineProvider>,
  );
}

describe("TrashBanner", () => {
  it("renders the native Portuguese pluralization instead of ICU syntax", async () => {
    await renderTrashBanner("pt-BR");

    expect(screen.getByRole("alert").textContent).toContain(
      "As páginas na lixeira serão excluídas permanentemente após 30 dias.",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "{count, plural",
    );
  });

  it("falls back to English when the selected locale has no retention key", async () => {
    await renderTrashBanner("de-DE");

    expect(screen.getByRole("alert").textContent).toContain(
      "Pages in trash will be permanently deleted after 30 days.",
    );
  });
});
