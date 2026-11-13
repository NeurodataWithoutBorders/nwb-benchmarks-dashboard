import { describe, expect, it } from "vitest";
import { toCsv, type Column } from "../../src/lib/csv";

describe("toCsv", () => {
  it("writes a header and one line per row, quoting where needed", () => {
    const columns: Column<{ name: string; value: number | null }>[] = [
      { label: "Name", value: (row) => row.name },
      { label: "Value, s", value: (row) => row.value },
    ];
    expect(
      toCsv(columns, [
        { name: 'say "hi"', value: 1.5 },
        { name: "plain", value: null },
        { name: "line\nbreak", value: Number.NaN },
      ]),
    ).toBe('Name,"Value, s"\n"say ""hi""",1.5\nplain,\n"line\nbreak",\n');
  });
});
