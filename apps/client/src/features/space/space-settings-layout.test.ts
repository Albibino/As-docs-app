import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as config from "@/lib/config.ts";

const sourceRoot = resolve(process.cwd(), "src");
const readSource = (relativePath: string) =>
  readFileSync(resolve(sourceRoot, relativePath), "utf8");

describe("configuração de espaço em tela completa", () => {
  it("gera URLs estáveis para cada aba de configuração do espaço", () => {
    const getSpaceSettingsUrl = (config as any).getSpaceSettingsUrl;

    expect(getSpaceSettingsUrl?.("general", "members")).toBe(
      "/s/general/settings/members",
    );
    expect(getSpaceSettingsUrl?.("general")).toBe(
      "/s/general/settings/general",
    );
  });

  it("registra a rota e usa o shell de configurações para espaços", () => {
    const appSource = readSource("App.tsx");
    const shellSource = readSource(
      "components/layouts/global/global-app-shell.tsx",
    );

    expect(appSource).toMatch(
      /path=\{["']\/s\/:spaceSlug\/settings\/:tab["']\}/,
    );
    expect(appSource).toMatch(/SpaceSettings/);
    expect(shellSource).toMatch(/isSpaceSettingsRoute/);
    expect(shellSource).toMatch(/SettingsSidebar[^\n]*scope=["']space["']/);
    expect(shellSource).toMatch(/isSettingsLayoutRoute/);
    expect(shellSource).toMatch(
      /showGlobalSidebar[\s\S]*!isSettingsLayoutRoute/,
    );
  });

  it("compõe as abas com os painéis de configuração já existentes", () => {
    const pagePath = resolve(
      sourceRoot,
      "pages/settings/space/space-settings.tsx",
    );
    const pageSource = existsSync(pagePath)
      ? readFileSync(pagePath, "utf8")
      : "";

    for (const component of [
      "SpaceDetails",
      "SpacePermissions",
      "LabelTaxonomyManager",
      "SpacePagePropertiesSettings",
    ]) {
      expect(pageSource).toMatch(new RegExp(component));
    }

    expect(pageSource).toMatch(/SpaceCaslAction\.Manage/);
    expect(pageSource).toMatch(/SpaceCaslSubject\.Label/);
    expect(pageSource).toMatch(/SpaceCaslSubject\.Settings/);
  });

  it("troca as três entradas atuais do modal por navegação para a rota", () => {
    const sidebarSource = readSource(
      "features/space/components/sidebar/space-sidebar.tsx",
    );
    const listSource = readSource("features/space/components/space-list.tsx");
    const allSpacesSource = readSource(
      "features/space/components/spaces-page/all-spaces-list.tsx",
    );

    for (const source of [sidebarSource, listSource, allSpacesSource]) {
      expect(source).toMatch(/getSpaceSettingsUrl|\/settings\/general/);
      expect(source).not.toMatch(/SpaceSettingsModal/);
      expect(source).toContain("settingsOrigin");
    }

    expect(listSource).toContain("handleClick(space.slug)");
  });

  it("posiciona a entrada principal de configurações abaixo do grafo local", () => {
    const sidebarSource = readSource(
      "features/space/components/sidebar/space-sidebar.tsx",
    );
    const pagesSectionIndex = sidebarSource.indexOf("classes.sectionPages");
    const graphIndex = sidebarSource.indexOf("<LocalPageGraph />");
    const primarySettingsIndex = sidebarSource.lastIndexOf(
      "onClick={openSettings}",
    );
    const topNavigationEnd = sidebarSource.indexOf(
      "<SidebarFavorites spaceId={space.id} />",
    );
    const topNavigation = sidebarSource.slice(0, topNavigationEnd);

    expect(primarySettingsIndex).toBeGreaterThan(pagesSectionIndex);
    expect(primarySettingsIndex).toBeGreaterThan(graphIndex);
    expect(topNavigation).not.toContain('t("Space settings")');
    expect(sidebarSource.match(/t\("Space settings"\)/g)).toHaveLength(2);
  });

  it("ancora as configurações no rodapé com a mesma moldura da barra global", () => {
    const sidebarSource = readSource(
      "features/space/components/sidebar/space-sidebar.tsx",
    );
    const sidebarStyles = readSource(
      "features/space/components/sidebar/space-sidebar.module.css",
    );
    const globalStyles = readSource(
      "components/layouts/global/global-sidebar.module.css",
    );

    expect(sidebarSource).toMatch(/className=\{classes\.bottomSection\}/);

    const bottomSectionRule = (styles: string) =>
      styles.match(/\.bottomSection\s*\{[\s\S]*?\}/)?.[0] ?? "";

    // Same frame as the global sidebar…
    for (const declaration of [
      "padding-top: var(--mantine-spacing-xs);",
      "border-top: rem(1px) solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4));",
    ]) {
      expect(bottomSectionRule(globalStyles)).toContain(declaration);
      expect(bottomSectionRule(sidebarStyles)).toContain(declaration);
    }

    // …plus the auto margin that keeps it pinned when the page tree is hidden
    // in the collapsed state.
    expect(bottomSectionRule(sidebarStyles)).toContain("margin-top: auto;");
  });

  it("preserva a origem ao entrar e sair da configuração de espaço", () => {
    const originSource = readSource("hooks/use-track-origin.ts");

    expect(originSource).toContain("^\\/s\\/[^/]+\\/settings");
    expect(originSource).toMatch(/startsWith\("\/settings"\)/);

    const sidebarSource = readSource(
      "components/settings/settings-sidebar.tsx",
    );
    expect(sidebarSource).toContain("state={location.state}");
    expect(readSource("hooks/use-settings-navigation.ts")).toContain(
      "preferredOrigin",
    );
  });
});
