import Electron from "electron";
import * as path from "path";
import activeWin from "active-win";

export type UserConfig = {
    /**
     * Enable debug mode
     * Default: false
     */
    DEBUG: boolean;
    /**
     * Output file name
     * Default: README.md
     */
    outputFileName: string;
    /**
     * format input by this function and append the result
     * Default: for markdown
     */
    outputContentTemplate: (args: OutputContentTemplateArgs) => string;
    /**
     * Auto focus when open input window
     * Default: true
     */
    autoFocus: boolean;
    /**
     * Save content automatically without no focus the input window after autoSaveTimeoutMs
     * Default: true
     */
    autoSave: boolean;
    /**
     * config for autosave
     * Default: 30 * 1000
     */
    autoSaveTimeoutMs: number;
    /**
     * bound ratio for screenshot
     * Increase actual focus area using this ratio.
     * Default: 1.2
     */
    screenshotBoundRatio: number;
    /**
     * Max search count for related content that is included into screenshot result
     * The higher the number, screenshot size is large.
     * Default: 5
     */
    screenshotSearchRectangleMaxCount: number;
};
export type UserConfigCreatorArgs = { app: Electron.App; path: typeof path; activeWindow: activeWin.Result };
export type OutputContentTemplateArgs = {
    imgPath: string;
    selectedContent: {
        raw: string;
        value: string;
    };
    inputContent: {
        raw: string;
        value: string;
    };
};
export const defaultShortcutKey = "CommandOrControl+Shift+X";
export const createUserConfig = ({ app, path, activeWindow }: UserConfigCreatorArgs): UserConfig => {
    return {
        outputFileName: "README.md",
        // Output Template Function
        outputContentTemplate: ({ imgPath, selectedContent, inputContent }: OutputContentTemplateArgs) => {
            return (
                `![](${imgPath})\n` +
                (selectedContent.value ? `\n>  ${selectedContent.value.split("\n").join("\n> ")}\n` : "") +
                (inputContent.raw ? `\n${inputContent.raw.trimRight()}\n` : "") +
                "\n---\n\n"
            );
        },
        autoFocus: true,
        autoSave: true,
        autoSaveTimeoutMs: 30 * 1000,
        screenshotBoundRatio: 1.2,
        screenshotSearchRectangleMaxCount: 5,
        DEBUG: false,
    };
};
