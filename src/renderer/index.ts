require("./index.css");
require("codemirror/lib/codemirror.css");
import { ipcRenderer } from "electron";
import CodeMirror from "codemirror";
import "codemirror/addon/edit/continuelist.js";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/markdown/markdown.js";

const app = document.getElementById("app");
if (!app) {
    throw new Error("Not found app");
}
const textarea = document.createElement("textarea");
app.appendChild(textarea);
const imgDiv = document.createElement("div");
imgDiv.className = "img";
// img
const img = document.createElement("img");
imgDiv.appendChild(img);
app.appendChild(imgDiv);
// Save button
const saveButton = document.createElement("button");
saveButton.className = "saveButton";
saveButton.textContent = "Save";
// Cancel button
const cancelButton = document.createElement("button");
cancelButton.className = "cancelButton";
cancelButton.textContent = "Cancel";
// Copy
const copyButton = document.createElement("button");
copyButton.className = "copyButton";
copyButton.textContent = "Copy";

function save() {
    ipcRenderer.send("save", editor.getValue());
}

function cancel() {
    ipcRenderer.send("cancel");
}

function copy() {
    ipcRenderer.send("copy", editor.getValue());
}

saveButton.addEventListener("click", () => {
    save();
});
cancelButton.addEventListener("click", () => {
    cancel();
});
copyButton.addEventListener("click", () => {
    copy();
});
app.appendChild(saveButton);
app.appendChild(cancelButton);
app.appendChild(copyButton);
const editor = CodeMirror.fromTextArea(textarea, {
    mode: "markdown",
    lineNumbers: false,
    lineWrapping: true,
    extraKeys: {
        Enter: "newlineAndIndentContinueMarkdownList",
        "Cmd-Enter": function () {
            save();
        }
    }
});

ipcRenderer.on("reset", () => {
    editor.setValue("");
    imgDiv.removeAttribute("style");
    imgDiv.classList.remove("placeholder");
});
ipcRenderer.on("update", (event, value: string, imageSrc: string) => {
    editor.setValue(value);
    requestAnimationFrame(() => {
        editor.focus();
        editor.setCursor(editor.lineCount(), 0);
    });
    imgDiv.classList.add("placeholder");
    imgDiv.style.backgroundImage = `url(${imageSrc})`;
});

ipcRenderer.on("update:image", (event, imageSrc: string) => {
    imgDiv.classList.remove("placeholder");
    imgDiv.style.backgroundImage = `url(${imageSrc})`;
});
