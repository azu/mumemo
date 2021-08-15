import "@jxa/global-type";
import { run } from "@jxa/run";

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

export function sendKeyStroke(key: string, modifierOption: ModifierOption) {
    const modifiers = createModifier(modifierOption);
    return run(
        (key, modifiers) => {
            const SystemEvents = Application("System Events");
            const app = Application.currentApplication();
            app.includeStandardAdditions = true;
            /*
             * key code 123 -- left arrow
             * key code 124 -- right arrow
             * key code 125 -- down arrow
             * key code 126 -- up arrow
             * key code 49 -- space
             */
            if (key === "ArrowLeft") {
                SystemEvents.keyCode(123, { using: modifiers });
            } else if (key === "ArrowRight") {
                SystemEvents.keyCode(124, { using: modifiers });
            } else if (key === "ArrowDown") {
                SystemEvents.keyCode(125, { using: modifiers });
            } else if (key === "ArrowUp") {
                SystemEvents.keyCode(126, { using: modifiers });
            } else if (key === "Space") {
                SystemEvents.keyCode(49, { using: modifiers });
            } else {
                SystemEvents.keystroke(key, { using: modifiers });
            }
        },
        key,
        modifiers
    );
}
