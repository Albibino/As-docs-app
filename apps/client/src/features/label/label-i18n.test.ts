import enUS from "../../../public/locales/en-US/translation.json";
import ptBR from "../../../public/locales/pt-BR/translation.json";

const eng1957Keys = [
  "Label path",
  "Color brightness is limited between {{min}}% and {{max}}%.",
  "Hue",
  "Add child",
  "Add item",
  "Delete label node",
  "Delete label tree",
  "Deleting {{name}} also deletes its descendants and removes selections from {{pages}} page(s). This cannot be undone.",
  "Deleting {{name}} also deletes {{nodes}} nodes and removes their selections from {{pages}} page(s). This cannot be undone.",
  "Deleting {{name}} removes it from {{pages}} page(s). This cannot be undone.",
  "Edit label node",
  "Edit label tree",
  "Failed to create label node",
  "Failed to create label tree",
  "Failed to delete label node",
  "Failed to delete label tree",
  "Failed to move label node",
  "Failed to remove taxonomy selection",
  "Failed to shorten taxonomy path",
  "Failed to update label node",
  "Failed to update label tree",
  "Failed to update taxonomy",
  "Filter this whole tree",
  "Free labels",
  "Label node reordered",
  "Drag to reorder label node",
  "Move label node",
  "New free label",
  "New label node",
  "New label tree",
  "No labels yet. Create a tree for hierarchical, mutually exclusive options or a free label for independent tagging.",
  "One active path per document",
  "Parent",
  "Preselect free labels or one active path per taxonomy tree",
  "Remove path",
  "Remove taxonomy path",
  "Root node",
  "Select the tree itself",
  "Shorten path",
  "Shorten taxonomy path",
  "This changes the path on {{pages}} page(s): {{from}} → {{to}}.",
  "This removes the entire selected path from the document: {{path}}.",
  "This removes this segment and everything below it from the document path.",
  "Tree",
  "one active path",
];

const backendLabelMessages = [
  "Free label not found",
  "Invalid label name",
  "Label changed concurrently",
  "Label tree not found",
  "Label node not found",
  "A label node cannot be moved below its descendant",
  "The move target belongs to a different tree",
  "Label nodes can only be reordered among siblings",
  "A label node with this name already exists here",
  "A free label with this name already exists",
  "Free labels cannot be moved into a taxonomy tree",
  "Taxonomy nodes must be deleted through the node endpoint",
  "A label tree with this name already exists",
  "The label node belongs to a different tree or scope",
  "Label not found",
];

const interpolationTokens = (value: string) =>
  [...value.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((match) => match[1]).sort();

describe("label taxonomy translations", () => {
  it.each([...eng1957Keys, ...backendLabelMessages])(
    "defines %s in en-US and pt-BR",
    (key) => {
      expect(Object.prototype.hasOwnProperty.call(enUS, key)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(ptBR, key)).toBe(true);
    },
  );

  it("keeps interpolation tokens identical between en-US and pt-BR", () => {
    for (const key of [...eng1957Keys, ...backendLabelMessages]) {
      const english = enUS[key as keyof typeof enUS];
      const portuguese = ptBR[key as keyof typeof ptBR];

      if (typeof english === "string" && typeof portuguese === "string") {
        expect(interpolationTokens(portuguese)).toEqual(
          interpolationTokens(english),
        );
      }
    }
  });
});
