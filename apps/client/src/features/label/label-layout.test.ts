import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getNodeIndent } from "./components/admin/label-taxonomy-manager.tsx";

const labelStyles = readFileSync(
  resolve(process.cwd(), "src/features/label/label.module.css"),
  "utf8",
);

describe("label layout styles", () => {
  it("mantém chips compactos com ellipsis e texto acessível completo", () => {
    expect(labelStyles).toMatch(
      /\.chipName\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(labelStyles).toMatch(/\.chipLink\s*\{[\s\S]*?min-width:\s*0;/);
  });

  it("mantém chips compactos sem estrutura de expansão", () => {
    expect(labelStyles).not.toMatch(/\.chipExpand/);
    expect(labelStyles).not.toMatch(/transition:\s*width\s+180ms/);
    expect(labelStyles).toMatch(/\.chip\s*\{[\s\S]*?padding:\s*4px 8px;/);
  });

  it("dimensiona o seletor completo entre 240px e 300px", () => {
    expect(labelStyles).toMatch(
      /\.popoverDropdown\s*\{[\s\S]*?min-width:\s*min\(240px,\s*calc\(100vw\s*-\s*16px\)\);[\s\S]*?max-width:\s*min\(300px,\s*calc\(100vw\s*-\s*16px\)\);/,
    );
    expect(labelStyles).toMatch(
      /\.popover\s*\{[\s\S]*?width:\s*var\(--label-picker-width,\s*240px\);/,
    );
    expect(labelStyles).toMatch(
      /\.popoverList\s*\{[\s\S]*?overflow-x:\s*hidden;/,
    );

    for (const sourcePath of [
      "src/features/label/components/page-labels-inline.tsx",
      "src/features/label/components/labels-section.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
      expect(source).toMatch(
        /<Popover\.Dropdown p=\{0\} className=\{classes\.popoverDropdown\}>/,
      );
    }
  });

  it("uses one indentation increment for every nested node wrapper", () => {
    expect(getNodeIndent(0)).toBe(0);
    expect(getNodeIndent(1)).toBe(22);
    expect(getNodeIndent(2)).toBe(22);
    expect(getNodeIndent(8)).toBe(22);
  });

  it("keeps a small horizontal gap between node names and controls", () => {
    const managerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/label/components/admin/label-taxonomy-manager.tsx",
      ),
      "utf8",
    );

    expect(managerSource).toMatch(/className=\{classes\.nodeRowContent\}/);
    expect(managerSource).toMatch(/gap=\{0\}/);
    expect(managerSource).toMatch(/columnGap: 10, rowGap: 8/);
    expect(managerSource).toMatch(
      /<Stack[\s\S]*?gap=\{6\}[\s\S]*?className=\{parentId === null \? undefined : classes\.nodeListNested\}/,
    );
    expect(labelStyles).toMatch(
      /\.nodeListNested\s*\{[\s\S]*?margin-top:\s*8px;/,
    );
  });

  it("organizes node rows with description, hover and separators", () => {
    const managerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/label/components/admin/label-taxonomy-manager.tsx",
      ),
      "utf8",
    );

    expect(managerSource).toMatch(/node\.description/);
    expect(managerSource).toMatch(/className=\{classes\.nodeDescription\}/);
    expect(managerSource).toMatch(/variant="dot"/);
    expect(managerSource).toMatch(/t\("Add item"\)/);
    expect(managerSource).not.toMatch(/t\("Add root"\)/);
    expect(managerSource).not.toMatch(/<Badge/);
    expect(managerSource).not.toMatch(/t\("Move up"\)/);
    expect(managerSource).not.toMatch(/t\("Move down"\)/);
    expect(managerSource).toMatch(/className=\{classes\.treeHeader\}/);

    const treeHeader = managerSource.match(
      /className=\{classes\.treeHeader\}[\s\S]*?<\/Group>/,
    )?.[0];
    expect(treeHeader).toBeDefined();
    expect(treeHeader).not.toContain("IconGripVertical");
    expect(managerSource).toMatch(/className=\{classes\.nodeDragHandle\}/);
    expect(labelStyles).toMatch(
      /\.dotChip\s*\{[\s\S]*?color:\s*var\(--mantine-color-text\);/,
    );
    const dotMarkerStyles = labelStyles.match(
      /\.dotChipMarker\s*\{([^}]*)\}/,
    )?.[1];
    expect(dotMarkerStyles).toMatch(/width:\s*10px;/);
    expect(dotMarkerStyles).toMatch(/height:\s*10px;/);
  });

  it("applies hover, focus and separators to administrative rows", () => {
    expect(labelStyles).toMatch(
      /\.nodeDropTarget:hover[\s\S]*?background-color:/,
    );
    expect(labelStyles).toMatch(/\.nodeDropTarget:focus-within/);
    expect(labelStyles).toMatch(/\.nodeRow \+ \.nodeRow[\s\S]*?border-top:/);
    expect(labelStyles).toMatch(
      /\.nodeListNested[\s\S]*?border-top:[\s\S]*?padding-top:/,
    );
  });

  it("amplia somente as rotas de administração de labels", () => {
    const shellSource = readFileSync(
      resolve(
        process.cwd(),
        "src/components/layouts/global/global-app-shell.tsx",
      ),
      "utf8",
    );

    expect(shellSource).toMatch(/isLabelsSettingsRoute/);
    expect(shellSource).toMatch(/size=\{isLabelsSettingsRoute \? 1100 : 900\}/);
    expect(shellSource).toMatch(/\/settings\/labels/);
    expect(shellSource).toMatch(
      /\^\\\/s\\\/\[\^\/\]\+\\\/settings\\\/labels\$/,
    );
  });

  it("restricts the manager drag and drop to sibling reordering", () => {
    const managerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/label/components/admin/label-taxonomy-manager.tsx",
      ),
      "utf8",
    );

    expect(managerSource).toMatch(/dragHandle/);
    expect(managerSource).toMatch(/allowedEdges: \["top", "bottom"\]/);
    expect(managerSource).not.toMatch(/\sdraggable\s*$/m);
    expect(managerSource).not.toMatch(/onDrop=\{\(event\) =>/);
    expect(managerSource).not.toMatch(/children\.length\}\)/);
  });
});
