import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(process.cwd(), "src");
const readSource = (relativePath: string) =>
  readFileSync(resolve(sourceRoot, relativePath), "utf8");

describe("layout do filtro de labels da busca", () => {
  it("adapta o dropdown ao caminho completo e preserva o tooltip", () => {
    const componentSource = readSource(
      "features/search/components/search-label-filter.tsx",
    );
    const stylesSource = readSource(
      "features/search/components/search-spotlight-filters.module.css",
    );

    expect(componentSource).toContain('width="max-content"');
    expect(componentSource).toContain("classes.labelFilterDropdown");
    expect(componentSource).toContain("LabelPathTooltip");
    expect(componentSource).toContain("ariaLabel={label.displayName}");
    expect(componentSource).not.toContain("lineClamp={1}");
    expect(stylesSource).toMatch(
      /\.labelFilterDropdown\s*\{[\s\S]*?min-width:\s*min\(240px,\s*calc\(100vw\s*-\s*32px\)\);[\s\S]*?max-width:\s*min\(640px,\s*calc\(100vw\s*-\s*32px\)\);/,
    );
    expect(stylesSource).toMatch(
      /\.labelFilterText,\s*\.labelFilterSectionTitle\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
  });
});
