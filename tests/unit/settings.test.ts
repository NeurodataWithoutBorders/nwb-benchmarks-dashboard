// @vitest-environment jsdom
// A figure card's settings popup, against hand-built elements.
import { beforeEach, describe, expect, it } from "vitest";
import { initSettings, type SettingsPopup } from "../../src/ui/settings";

let button: HTMLButtonElement;
let panel: HTMLDivElement;
let outside: HTMLParagraphElement;
let popup: SettingsPopup;

beforeEach(() => {
  button = document.createElement("button");
  panel = document.createElement("div");
  panel.hidden = true;
  panel.append(document.createElement("select"));
  outside = document.createElement("p");
  document.body.replaceChildren(button, panel, outside);
  popup = initSettings(button, panel);
});

describe("the settings popup", () => {
  it("opens and closes from its gear", () => {
    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    button.click();
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open for clicks inside it, and closes for one elsewhere", () => {
    button.click();
    (panel.firstElementChild as HTMLElement).click();
    expect(panel.hidden).toBe(false);
    outside.click();
    expect(panel.hidden).toBe(true);
    outside.click();
    expect(panel.hidden).toBe(true);
  });

  it("closes on Escape, handing focus back to the gear", () => {
    button.click();
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(panel.hidden).toBe(false);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    // Escape with the popup closed leaves focus where it is.
    outside.tabIndex = 0;
    outside.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.activeElement).toBe(outside);
    button.click();
    popup.close();
    expect(panel.hidden).toBe(true);
  });
});
