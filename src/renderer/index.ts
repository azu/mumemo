require("./index.css");
import { ipcRenderer } from "electron";

const HyperMD = require("hypermd");
const app = document.getElementById("app");
if (!app) {
    throw new Error("Not found app");
}
const textarea = document.createElement("textarea");
app.appendChild(textarea);
const imgDiv = document.createElement("div");
// img
const img = document.createElement("img");
imgDiv.className = "img";
imgDiv.appendChild(img);
app.appendChild(imgDiv);
// save button
const saveButton = document.createElement("button");
saveButton.className = "saveButton";
saveButton.textContent = "Save";

function save() {
    ipcRenderer.send("save", editor.getValue());
}

saveButton.addEventListener("click", () => {
    save();
});
app.appendChild(saveButton);
const editor = HyperMD.fromTextArea(textarea, {
    extraKeys: {
        "Cmd-Enter": function () {
            save();
        },
    },
});

ipcRenderer.on("update", (event, value: string, imageSrc: string) => {
    editor.setValue(value);
    requestAnimationFrame(() => {
        editor.focus();
        editor.setCursor(editor.lineCount(), 0);
    });
    imgDiv.style.backgroundImage = `url(${imageSrc})`;
});
ipcRenderer.on("update:image", (event, imageSrc: string) => {
    imgDiv.style.backgroundImage = `url(${imageSrc})`;
});
