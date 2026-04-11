/** Fixed-width column for `human` list output. */
export type TableColumn = { key: string; header: string; width: number };

function cellRaw(row: Record<string, unknown>, key: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return "";
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function truncateCell(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Renders a simple terminal table (header + rule + rows). Empty `rows` → "No rows.\n".
 */
export function renderRecordsTable(
  rows: readonly Record<string, unknown>[],
  columns: readonly TableColumn[],
  footerLines?: readonly string[],
): string {
  if (rows.length === 0) {
    return "No rows.\n";
  }
  const out: string[] = [];
  out.push(
    `${columns.map((c) => truncateCell(c.header, c.width).padEnd(c.width)).join(" ")}\n`,
  );
  out.push(`${columns.map((c) => "-".repeat(c.width)).join(" ")}\n`);
  for (const row of rows) {
    const line = columns
      .map((c) => truncateCell(cellRaw(row, c.key), c.width).padEnd(c.width))
      .join(" ");
    out.push(`${line}\n`);
  }
  if (footerLines?.length) {
    for (const f of footerLines) {
      out.push(`${f}\n`);
    }
  }
  return out.join("");
}
