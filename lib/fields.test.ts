import { describe, expect, it } from "vitest";
import { coerceCustomFields, coerceFieldValue, formatFieldValue, newFieldKey, type FieldDef } from "./fields";

const def = (type: FieldDef["type"], options: string[] = []): FieldDef => ({
  id: "x",
  entity: "customers",
  key: "f_test",
  label: "שדה",
  type,
  options,
  position: 0,
  show_in_list: false,
});

describe("custom fields", () => {
  it("coerces values by type", () => {
    expect(coerceFieldValue(def("number"), "1,200")).toEqual({ ok: true, value: 1200 });
    expect(coerceFieldValue(def("money"), "₪ 350")).toEqual({ ok: true, value: 350 });
    expect(coerceFieldValue(def("number"), "abc").ok).toBe(false);
    expect(coerceFieldValue(def("date"), "2026-10-07")).toEqual({ ok: true, value: "2026-10-07" });
    expect(coerceFieldValue(def("date"), "07/10/2026").ok).toBe(false);
    expect(coerceFieldValue(def("checkbox"), "כן")).toEqual({ ok: true, value: true });
    expect(coerceFieldValue(def("multiselect"), "א, ב, א")).toEqual({ ok: true, value: ["א", "ב"] });
    expect(coerceFieldValue(def("text"), "  ")).toEqual({ ok: true, value: null });
  });

  it("validates a patch and drops unknown keys and empty values", () => {
    const defs = [def("number"), { ...def("text"), key: "f_name" }];
    expect(coerceCustomFields(defs, { f_test: "5", f_name: "", other: "x" })).toEqual({ ok: true, value: { f_test: 5 } });
    expect(coerceCustomFields(defs, { f_test: "x" }).ok).toBe(false);
  });

  it("formats for display", () => {
    expect(formatFieldValue(def("checkbox"), true)).toBe("כן");
    expect(formatFieldValue(def("multiselect"), ["א", "ב"])).toBe("א, ב");
    expect(formatFieldValue(def("text"), null)).toBe("");
  });

  it("makes stable ascii keys", () => {
    expect(newFieldKey()).toMatch(/^f_[a-z0-9]{1,40}$/);
  });
});
