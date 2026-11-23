import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosAdapter } from "axios";
import { createInstance } from "i18next";
import { HelmetProvider } from "react-helmet-async";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import deDE from "../../../public/locales/de-DE/translation.json";
import enUS from "../../../public/locales/en-US/translation.json";
import ptBR from "../../../public/locales/pt-BR/translation.json";
import useAuth from "@/features/auth/hooks/use-auth";
import api from "@/lib/api-client";
import LoginPage from "./login";

const adapter = api.defaults.adapter;

afterEach(() => {
  api.defaults.adapter = adapter;
  vi.unstubAllGlobals();
});

async function renderLogin(
  path = "/login",
  lng = "en-US",
  cachedStatus?: boolean,
) {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const i18n = createInstance();
  await i18n.init({
    lng,
    fallbackLng: "en-US",
    showSupportNotice: false,
    resources: {
      "de-DE": { translation: deDE },
      "en-US": { translation: enUS },
      "pt-BR": { translation: ptBR },
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnMount: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  });
  if (cachedStatus !== undefined) {
    queryClient.setQueryData(["oidc-status"], cachedStatus);
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nextProvider i18n={i18n}>
        <MantineProvider>
          <QueryClientProvider client={queryClient}>
            <HelmetProvider>
              <Routes>
                <Route path="/home" element={<LogoutFixture />} />
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </HelmetProvider>
          </QueryClientProvider>
        </MantineProvider>
      </I18nextProvider>
    </MemoryRouter>,
  );
}

function LogoutFixture() {
  const { logout } = useAuth();
  return <button onClick={logout}>Log out</button>;
}

function mockAuthApi(getStatus: () => unknown) {
  const request = vi.fn<AxiosAdapter>(async (config) => {
    const route = `${config.method} ${config.baseURL}${config.url}`;
    let data: unknown;
    switch (route) {
      case "get /api/auth/oidc/status":
        data = await getStatus();
        break;
      case "post /api/auth/users":
        data = [{ key: "usuario-1", id: "1", name: "Usuário 1" }];
        break;
      case "post /api/auth/logout":
        break;
      default:
        throw new Error(`Unexpected request: ${route}`);
    }
    return {
      config,
      data: { data, success: true, status: 200 },
      headers: {},
      request: {},
      status: 200,
      statusText: "OK",
    };
  });
  api.defaults.adapter = request;
  return request;
}

describe("LoginPage", () => {
  it("reads the backend response envelope and offers only Keycloak sign-in", async () => {
    const request = mockAuthApi(() => ({ enabled: true }));
    await renderLogin("/login?redirect=%2Fs%2Fdocumentos");

    const link = await screen.findByRole("link", {
      name: "Sign in with Keycloak",
    });
    expect(link.getAttribute("href")).toBe("/api/auth/oidc/login");
    expect(link.getAttribute("target")).toBeNull();
    expect(
      screen.getByText("Collaborative documentation with AI."),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Choose a user" })).toBeNull();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "get",
        baseURL: "/api",
        url: "/auth/oidc/status",
      }),
    );
  });

  it("loads the legacy user selector only after an explicit disabled response", async () => {
    const request = mockAuthApi(() => ({ enabled: false }));
    await renderLogin();

    expect(
      await screen.findByRole("button", { name: "Usuário 1" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Sign in with Keycloak" }),
    ).toBeNull();
    expect(
      request.mock.calls.map(([config]) => `${config.method} ${config.url}`),
    ).toEqual(["get /auth/oidc/status", "post /auth/users"]);
  });

  it.each([undefined, false])(
    "withholds sign-in options while checking status (cached: %s)",
    async (cached) => {
      let resolveStatus!: (status: { enabled: boolean }) => void;
      const pending = new Promise<{ enabled: boolean }>((resolve) => {
        resolveStatus = resolve;
      });
      const request = mockAuthApi(() => pending);
      await renderLogin("/login", "en-US", cached);

      expect(screen.getByRole("status").textContent).toBe(
        "Checking sign-in options…",
      );
      expect(
        screen.queryByRole("heading", { name: "Choose a user" }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Sign in with Keycloak" }),
      ).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);

      resolveStatus({ enabled: true });
      expect(
        await screen.findByRole("link", { name: "Sign in with Keycloak" }),
      ).toBeTruthy();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("fails closed on a status request error and lets the user retry in Portuguese", async () => {
    const getStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("Internal status error details"))
      .mockResolvedValueOnce({ enabled: true });
    const request = mockAuthApi(getStatus);
    await renderLogin("/login", "pt-BR");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível verificar as opções de entrada.",
    );
    expect(screen.queryByText("Internal status error details")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Escolha um usuário" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Entrar com o Keycloak" }),
    ).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("link", { name: "Entrar com o Keycloak" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([null, {}, { enabled: "false" }, { data: { enabled: false } }])(
    "rejects malformed status: %j",
    async (data) => {
      const request = mockAuthApi(() => data);
      await renderLogin();

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Could not check sign-in options.",
      );
      expect(
        screen.queryByRole("heading", { name: "Choose a user" }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Sign in with Keycloak" }),
      ).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["en-US", "Could not sign in with Keycloak.", "Sign in with Keycloak"],
    [
      "pt-BR",
      "Não foi possível entrar com o Keycloak.",
      "Entrar com o Keycloak",
    ],
    ["de-DE", "Could not sign in with Keycloak.", "Sign in with Keycloak"],
  ])(
    "shows the callback failure and a fresh sign-in link in %s",
    async (lng, message, linkLabel) => {
      const request = mockAuthApi(() => ({ enabled: true }));
      await renderLogin(
        "/login?oidc=failed&next=https%3A%2F%2Fexample.com&error=provider-details",
        lng,
      );

      expect(screen.getByRole("alert").textContent).toBe(message);
      const link = await screen.findByRole("link", { name: linkLabel });
      expect(link.getAttribute("href")).toBe("/api/auth/oidc/login");
      expect(screen.queryByText(/provider-details/)).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("does not fall back to the public selector after an OIDC failure even if OIDC is now disabled", async () => {
    const request = mockAuthApi(() => ({ enabled: false }));
    await renderLogin("/login?oidc=failed");

    await screen.findByRole("alert");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Choose a user" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Sign in with Keycloak" }),
    ).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("posts local logout and returns to the sign-in screen without starting OIDC", async () => {
    const request = mockAuthApi(() => ({ enabled: true }));
    await renderLogin("/home");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(
      await screen.findByRole("link", { name: "Sign in with Keycloak" }),
    ).toBeTruthy();
    expect(
      request.mock.calls.map(([config]) => `${config.method} ${config.url}`),
    ).toEqual(["post /auth/logout", "get /auth/oidc/status"]);
  });
});
