// A figure card's settings popup, after dandi/usage-page's: the gear button opens and closes the panel
// of options under it, and a click elsewhere or Escape closes it again.

export interface SettingsPopup {
  close: () => void;
}

export function initSettings(button: HTMLButtonElement, panel: HTMLElement): SettingsPopup {
  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", (event) => {
    const target = event.target as Node;
    if (!panel.hidden && !panel.contains(target) && !button.contains(target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    setOpen(false);
    button.focus();
  });
  return { close: () => setOpen(false) };
}
