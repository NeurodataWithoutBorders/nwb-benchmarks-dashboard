// A figure's numbers as a table (its card's Table view, and the keyboard and screen-reader route to
// every value a hover shows) and as a CSV download.

import { h } from "@brain-bbqs/ui";
import { toCsv, type CellValue, type Column } from "../lib/csv";
import { formatG } from "../lib/format";

function display(value: CellValue): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "number")
    return Number.isNaN(value) ? "–" : Number.isInteger(value) ? String(value) : formatG(value, 4);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value;
}

/** Puts the rows into a table inside `container`, replacing what it held. */
export function fillTable<T>(container: HTMLElement, columns: readonly Column<T>[], rows: readonly T[]): void {
  const table = h("table", "data-table");
  const head = h("tr");
  for (const column of columns) head.append(h("th", null, column.label));
  table.append(h("thead"), h("tbody"));
  table.tHead?.append(head);
  for (const row of rows) {
    const tr = h("tr");
    for (const column of columns) {
      const value = column.value(row);
      tr.append(
        h("td", typeof value === "number" ? "num" : null, column.format ? column.format(value) : display(value)),
      );
    }
    table.tBodies[0].append(tr);
  }
  container.replaceChildren(table);
}

/** Saves text as a file through a temporary link. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv<T>(filename: string, columns: readonly Column<T>[], rows: readonly T[]): void {
  downloadText(filename, toCsv(columns, rows), "text/csv");
}
