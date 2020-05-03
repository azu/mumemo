import { run } from "@jxa/run";
import type { Application as _ } from "@jxa/types";

declare var Application: typeof _;
import { clipboard } from "electron";
import { timeout } from "../timeout";

export type ModifierOption = {
    shift?: boolean;
    control?: boolean;
    option?: boolean;
    command?: boolean;
};

function createModifier(modifierOption: ModifierOption) {
    const modifiers = [];
    if (modifierOption.shift) {
        modifiers.push("shift down");
    }
    if (modifierOption.command) {
        modifiers.push("command down");
    }
    if (modifierOption.control) {
        modifiers.push("control down");
    }
    if (modifierOption.option) {
        modifiers.push("option down");
    }
    return modifiers;
}

export function copySelectedText(): Promise<string | undefined> {
    const modifiers = createModifier({
        command: true,
    });
    const oldText = clipboard.readText();
    return run(
        (key, modifiers) => {
            const SystemEvents = Application("System Events");
            SystemEvents.keystroke(key, { using: modifiers });
        },
        "c",
        modifiers
    )
        .then(() => {
            return timeout(1000);
        })
        .then(() => {
            const newText = clipboard.readText();
            console.log("newText", newText);
            return oldText !== newText ? newText : undefined;
        })
        .catch(() => {
            return undefined;
        });
}
