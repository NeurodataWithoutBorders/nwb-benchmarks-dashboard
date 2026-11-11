// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, downloadText, fillTable } from "../../src/ui/table";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fillTable", () => {
  it("builds the table when the details element opens, formatting each kind of value", () => {
    const details = document.createElement("details");
    details.append(document.createElement("summary"));
    fillTable(
      details,
      [
        { label: "Name", value: (row: { name: string; value: number | null; flag: boolean }) => row.name },
        { label: "Value", value: (row) => row.value },
        { label: "Flag", value: (row) => row.flag },
        { label: "Custom", value: (row) => row.value, format: () => "custom" },
      ],
      [
        { name: "a", value: 1.23456, flag: true },
        { name: "b", value: null, flag: false },
        { name: "c", value: 7, flag: false },
        { name: "d", value: Number.NaN, flag: false },
      ],
    );
    expect(details.querySelector("table")).toBeNull();
    details.open = true;
    details.ontoggle?.(new Event("toggle"));
    const cells = [...details.querySelectorAll("tbody tr")].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(cells).toEqual([
      ["a", "1.235", "yes", "custom"],
      ["b", "–", "no", "custom"],
      ["c", "7", "no", "custom"],
      ["d", "–", "no", "custom"],
    ]);
    details.ontoggle?.(new Event("toggle"));
    expect(details.querySelectorAll("table")).toHaveLength(1);
  });

  it("rebuilds an open table straight away", () => {
    const details = document.createElement("details");
    details.open = true;
    fillTable(details, [{ label: "A", value: (row: number) => row }], [1]);
    expect(details.querySelectorAll("td")).toHaveLength(1);
    details.open = false;
    details.ontoggle?.(new Event("toggle"));
  });
});

describe("downloads", () => {
  it("saves text through a temporary link", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadText("a.txt", "hello", "text/plain");
    downloadCsv("b.csv", [{ label: "A", value: (row: number) => row }], [1]);
    expect(click).toHaveBeenCalledTimes(2);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(document.querySelector("a")).toBeNull();
  });
});
