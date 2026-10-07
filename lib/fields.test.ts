import { describe, expect, it } from "vitest";
import { canStoreValues, coerceCustomFields, coerceFieldValue, coerceImportedFields, formatFieldValue, mergeCustomFields, newFieldKey, type FieldDef } from "./fields";

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

  it("merges a form patch without dropping other keys", () => {
    const defs = [def("number"), { ...def("text"), key: "f_name" }];
    const existing = { הערה: "מהקובץ", f_test: 3, f_name: "ישן", f_gone: "שדה שהוסר" };
    expect(mergeCustomFields(defs, existing, { f_test: "7", f_name: "", other: "x" })).toEqual({
      ok: true,
      value: { הערה: "מהקובץ", f_test: 7, f_gone: "שדה שהוסר" },
    });
    expect(mergeCustomFields(defs, null, { f_test: "abc" })).toEqual({ ok: false, error: '"שדה" צריך להיות מספר' });
    expect(mergeCustomFields(defs, existing, {})).toEqual({ ok: true, value: existing });
  });

  it("coerces imported cells leniently", () => {
    const defs = [def("number"), { ...def("checkbox"), key: "f_ok" }];
    expect(coerceImportedFields(defs, { f_test: "1,500", f_ok: "אולי", עמודה: "טקסט" })).toEqual({ f_test: 1500, עמודה: "טקסט" });
  });

  it("formats money and dates", () => {
    expect(formatFieldValue(def("money"), 1200, "ILS")).toBe("₪1,200");
    expect(formatFieldValue(def("date"), "2026-10-07")).toMatch(/^7 ב.+ 2026$/);
    expect(formatFieldValue(def("number"), 1500)).toBe("1,500");
  });

  it("knows which entities can store values", () => {
    expect(canStoreValues("customers")).toBe(true);
    expect(canStoreValues("activities")).toBe(true);
    expect(canStoreValues("services")).toBe(false);
  });
});
