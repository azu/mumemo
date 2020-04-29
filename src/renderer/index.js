require("./index.css");
const HyperMD = require("hypermd");
const app = document.getElementById("app");
const textarea = document.createElement("textarea");
app.appendChild(textarea);
const editor = HyperMD.fromTextArea(textarea);
console.log(editor);
