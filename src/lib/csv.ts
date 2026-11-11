// Comma-separated values for a figure's table, as its "Download CSV" button saves them.

export type CellValue = string | number | boolean | null | undefined;

export interface Column<T> {
  label: string;
  value: (row: T) => CellValue;
  /** How the on-page table shows the value; the CSV always carries it in full. */
  format?: (value: CellValue) => string;
}

function csvCell(value: CellValue): string {
  if (value === null || value === undefined || (typeof value === "number" && Number.isNaN(value))) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<T>(columns: readonly Column<T>[], rows: readonly T[]): string {
  const lines = [columns.map((column) => csvCell(column.label)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(column.value(row))).join(","));
  return `${lines.join("\n")}\n`;
}
