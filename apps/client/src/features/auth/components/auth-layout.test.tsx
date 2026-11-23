import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthLayout } from "./auth-layout.tsx";

vi.mock("@/components/theme-toggle.tsx", () => ({
  ThemeToggle: () => <button type="button" data-testid="theme-toggle" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("AuthLayout", () => {
  it("mostra o nome do produto sem a logo e oferece a troca de tema", () => {
    const { container } = render(
      <AuthLayout>
        <div>conteúdo</div>
      </AuthLayout>,
    );

    expect(screen.getByText("TCC Docs")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("theme-toggle")).toBeTruthy();
    expect(screen.getByText("conteúdo")).toBeTruthy();
  });
});
