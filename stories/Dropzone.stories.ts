import { withCard, withTheme } from "./utils";

type DropzoneState = "idle" | "dragover" | "rejected";

// Kept in sync with the dropzone markup in index.html and the refusal text in src/ui/dropzone.ts.
function buildDropzone(state: DropzoneState): HTMLElement {
  const dz = document.createElement("div");
  dz.id = "dropzone";
  dz.className = "dropzone";
  if (state === "dragover") dz.classList.add("dragover");
  dz.innerHTML = `
    <div class="dz-inner">
      <p>
        Or drop a copy of the results bundle (<code>bundle.json.gz</code>) here, or
        <button type="button" class="dz-browse">browse for one</button>.
      </p>
      <p class="dz-hint">A dropped bundle is read in your browser and never uploaded.</p>
      <p class="dz-reject" ${state === "rejected" ? "" : "hidden"}>
        That wasn't a file.<br /><br />Drop the results bundle (bundle.json.gz), or use the browse button instead.
      </p>
    </div>
  `;
  return withCard(dz);
}

export default {
  title: "Components/Dropzone",
};

export const IdleLight = {
  name: "Idle (light)",
  render: () => withTheme("light", () => buildDropzone("idle")),
};

export const IdleDark = {
  name: "Idle (dark)",
  render: () => withTheme("dark", () => buildDropzone("idle")),
};

export const DragOverLight = {
  name: "Drag over (light)",
  render: () => withTheme("light", () => buildDropzone("dragover")),
};

export const DragOverDark = {
  name: "Drag over (dark)",
  render: () => withTheme("dark", () => buildDropzone("dragover")),
};

export const RejectedLight = {
  name: "Not a file rejected (light)",
  render: () => withTheme("light", () => buildDropzone("rejected")),
};

export const RejectedDark = {
  name: "Not a file rejected (dark)",
  render: () => withTheme("dark", () => buildDropzone("rejected")),
};
