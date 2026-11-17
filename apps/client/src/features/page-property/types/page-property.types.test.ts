import { describe, expect, it } from "vitest";
import {
  normalizePagePropertyValue,
  PagePropertyConfig,
  PagePropertyType,
} from "./page-property.types";

const definition = (
  type: PagePropertyType,
  config: PagePropertyConfig,
) => ({ type, config });

const USER_1 = "11111111-1111-4111-8111-111111111111";
const USER_2 = "22222222-2222-4222-8222-222222222222";

describe("normalizePagePropertyValue", () => {
  it("wraps scalar person values when multiple values are allowed", () => {
    expect(
      normalizePagePropertyValue(
        definition("person", { allowMultiple: true }),
        USER_1,
      ),
    ).toEqual([USER_1]);
  });

  it("preserves arrays, nulls, and single-value properties", () => {
    const values = [USER_1, USER_2];
    expect(
      normalizePagePropertyValue(
        definition("person", { allowMultiple: true }),
        values,
      ),
    ).toBe(values);
    expect(
      normalizePagePropertyValue(
        definition("person", { allowMultiple: true }),
        null,
      ),
    ).toBeNull();
    expect(
      normalizePagePropertyValue(
        definition("person", { allowMultiple: false }),
        USER_1,
      ),
    ).toBe(USER_1);
  });

  it("never wraps date or number values", () => {
    expect(normalizePagePropertyValue(definition("date", {}), "2026-10-02")).toBe(
      "2026-10-02",
    );
    expect(normalizePagePropertyValue(definition("number", {}), 3)).toBe(3);
  });
});
