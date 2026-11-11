// The loading card: what is being fetched and how far along it is, why it failed, and the way to
// try again or drop a copy in instead.

import { humanSize } from "@brain-bbqs/utils";
import type { LoadProgress } from "../lib/bundle";
import type { AppElements } from "./elements";

export interface Loader {
  downloading: (progress: LoadProgress | null) => void;
  reading: (what: string) => void;
  failed: (message: string) => void;
  idle: (message: string) => void;
}

export function createLoader(els: AppElements): Loader {
  const setProgress = (fraction: number | null): void => {
    els.loadProgress.hidden = fraction === null;
    els.loadProgressFill.style.width = `${Math.round((fraction ?? 0) * 100)}%`;
  };
  const clearError = (): void => {
    els.loadError.hidden = true;
    els.loadError.textContent = "";
    els.retryLoadBtn.hidden = true;
  };
  return {
    downloading(progress) {
      clearError();
      if (progress === null) {
        els.loadStatus.textContent = "Downloading the latest results…";
        setProgress(0);
        return;
      }
      const total = progress.total ? ` of ${humanSize(progress.total)}` : "";
      els.loadStatus.textContent = `Downloading the latest results… ${humanSize(progress.received)}${total}`;
      setProgress(progress.total ? Math.min(1, progress.received / progress.total) : null);
    },
    reading(what) {
      clearError();
      els.loadStatus.textContent = `Reading ${what}…`;
      setProgress(1);
    },
    failed(message) {
      els.loadStatus.textContent = "The results could not be loaded.";
      els.loadError.textContent = message;
      els.loadError.hidden = false;
      els.retryLoadBtn.textContent = "Try again";
      els.retryLoadBtn.hidden = false;
      setProgress(null);
    },
    idle(message) {
      clearError();
      els.loadStatus.textContent = message;
      els.retryLoadBtn.textContent = "Download the latest results";
      els.retryLoadBtn.hidden = false;
      setProgress(null);
    },
  };
}
