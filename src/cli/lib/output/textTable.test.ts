import { describe, expect, test } from "bun:test";
import { renderRecordsTable } from "./textTable";

describe("renderRecordsTable", () => {
  test("empty rows → No rows.", () => {
    expect(renderRecordsTable([], [])).toBe("No rows.\n");
  });

  test("one row, two columns — header, rule, data", () => {
    const out = renderRecordsTable(
      [{ id: 1, name: "A" }],
      [
        { key: "id", header: "Id", width: 4 },
        { key: "name", header: "Name", width: 10 },
      ],
    );
    expect(out).toContain("Id");
    expect(out).toContain("Name");
    expect(out).toContain("----");
    expect(out).toContain("1");
    expect(out).toContain("A");
  });

  test("cell truncation — long value ends with ellipsis", () => {
    const out = renderRecordsTable(
      [{ x: "abcdefghijklmnopqrstuvwxyz" }],
      [{ key: "x", header: "H", width: 5 }],
    );
    expect(out).toContain("…");
  });

  test("footer lines appended", () => {
    const out = renderRecordsTable(
      [{ a: 1 }],
      [{ key: "a", header: "A", width: 3 }],
      ["total 5"],
    );
    expect(out.trimEnd().split("\n").pop()).toBe("total 5");
  });

  test("missing key in row → empty cell, no crash", () => {
    const out = renderRecordsTable(
      [{}],
      [
        { key: "id", header: "Id", width: 4 },
        { key: "name", header: "Nm", width: 4 },
      ],
    );
    expect(out).toContain("Id");
    expect(out.split("\n").length).toBeGreaterThan(3);
  });

  test("null vs object cell values", () => {
    const out = renderRecordsTable(
      [
        { n: null, o: { a: 1 } },
      ],
      [
        { key: "n", header: "N", width: 4 },
        { key: "o", header: "O", width: 12 },
      ],
    );
    expect(out).toContain('{"a":1}');
  });
});
