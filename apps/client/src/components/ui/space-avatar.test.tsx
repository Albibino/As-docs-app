import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SpaceAvatar } from "./space-avatar";

// jsdom ships no matchMedia, and MantineProvider resolves the colour scheme
// through it on mount.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderAvatar(props: Parameters<typeof SpaceAvatar>[0]) {
  return render(
    <MantineProvider>
      <SpaceAvatar {...props} />
    </MantineProvider>,
  );
}

describe("SpaceAvatar", () => {
  it("renders an uploaded logo", () => {
    const { container } = renderAvatar({
      name: "Engenharia",
      logo: "logo.png",
    });

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("falls back to initials when there is no logo", () => {
    const { container } = renderAvatar({ name: "Engenharia" });

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("EN")).toBeTruthy();
  });

  it("renders a space with no appearance", () => {
    const { container } = renderAvatar({ name: "Suporte" });

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("SU")).toBeTruthy();
  });
});
