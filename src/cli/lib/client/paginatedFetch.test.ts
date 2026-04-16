import { describe, expect, test } from "bun:test";
import { fetchAllPages, paginationQuery } from "./paginatedFetch";

describe("paginationQuery", () => {
  test("offset 0, limit 20 → ?limit=20", () => {
    expect(paginationQuery(0, 20)).toBe("?limit=20");
  });

  test("offset > 0 → ?limit=20&offset=10", () => {
    expect(paginationQuery(10, 20)).toBe("?limit=20&offset=10");
  });

  test("limit null (no cap) at offset 0 → empty string", () => {
    expect(paginationQuery(0, null)).toBe("");
  });

  test("limit null + offset → ?offset=5", () => {
    expect(paginationQuery(5, null)).toBe("?offset=5");
  });
});

describe("fetchAllPages", () => {
  test("single page covers all items", async () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const merged = await fetchAllPages(async () => {
      return {
        items: [a, b],
        total: 2,
        limit: 2,
        offset: 0,
      };
    }, 2);
    expect(merged.items).toEqual([a, b]);
    expect(merged.total).toBe(2);
    expect(merged.offset).toBe(0);
    expect(merged.limit).toBe(2);
  });

  test("two pages merge into one list", async () => {
    const a = { id: "a" };
    const b = { id: "b" };
    let call = 0;
    const merged = await fetchAllPages(async (offset) => {
      if (call++ === 0) {
        expect(offset).toBe(0);
        return {
          items: [a],
          total: 2,
          limit: 1,
          offset: 0,
        };
      }
      expect(offset).toBe(2);
      return {
        items: [b],
        total: 2,
        limit: 1,
        offset: 0,
      };
    }, 2);
    expect(merged.items).toEqual([a, b]);
    expect(merged.total).toBe(2);
  });

  test("empty first page → empty items, total 0", async () => {
    const merged = await fetchAllPages(async () => {
      return {
        items: [],
        total: 0,
        limit: 0,
        offset: 0,
      };
    }, 10);
    expect(merged.items).toEqual([]);
    expect(merged.total).toBe(0);
  });

  test("partial second page with empty items stops loop with items collected so far", async () => {
    const item = { id: 1 };
    let call = 0;
    const merged = await fetchAllPages(async (offset) => {
      if (call++ === 0) {
        expect(offset).toBe(0);
        return {
          items: [item],
          total: 3,
          limit: 1,
          offset: 0,
        };
      }
      expect(offset).toBe(2);
      return {
        items: [],
        total: 3,
        limit: 0,
        offset: 0,
      };
    }, 2);
    expect(merged.items).toEqual([item]);
    expect(merged.total).toBe(3);
  });

  test("fetchPage receives offsets 0 then pageSize when more pages needed", async () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const d = { id: "d" };
    const offsets: number[] = [];
    const merged = await fetchAllPages(async (offset) => {
      offsets.push(offset);
      if (offset === 0) {
        return {
          items: [a, b],
          total: 4,
          limit: 2,
          offset: 0,
        };
      }
      if (offset === 2) {
        return {
          items: [c, d],
          total: 4,
          limit: 2,
          offset: 0,
        };
      }
      throw new Error(`unexpected offset ${offset}`);
    }, 2);
    expect(offsets).toEqual([0, 2]);
    expect(merged.items).toEqual([a, b, c, d]);
    expect(merged.total).toBe(4);
  });
});
