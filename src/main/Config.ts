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
     * Output dir path
     * if set the path, use the path instead of stored path
     * Default: use stored path
     */
    outputDir?: string;
    /**
     * Output content file name
     * Default: README.md
     */
    outputContentFileName: string;
    /**
     * Output image directory prefix
     * If you want to put images to same dir with README.md, set "."
     * Default: img/
     */
    outputImageDirPrefix: string;
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
     * if quoteFrom is clipboard, quote text from clipboard
     * if quoteFrom is selectedText, quote text from selected text
     * Default: "selectedText"
     */
    quoteFrom: "clipboard" | "selectedText";
    /**
     * Send key stroke when ready to input window
     * Note: macOS only
     */
    sendKeyStrokeWhenReadyInputWindow?: {
        key: string;
        shift?: boolean;
        control?: boolean;
        option?: boolean;
        command?: boolean;
    };
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

    /**
     * if the rectangle count is over, mumemo give up to create focus image.
     * Just use screenshot image instead of focus image
     * Default: 80
     */
    screenshotGiveUpRectangleMaxCount: number;

    /**
     * if the factor value is defined, mumemo resize screenshot image with the factor.
     * Retina display's the factor value is 2.
     * display size * factor value is the result of screenshot image size.
     * if you want to resize the screeenshot image size, set `1` to `screenshotResizeFactor`
     * Default: displayFactor's value
     */
    screenshotResizeFactor?: number;
};
export type MumemoConfigFile = {
    shortcutKey?: string | string[];
    create?: (args: UserConfigCreatorArgs) => UserConfig;
};
export type UserConfigCreatorArgs = {
    app: Electron.App;
    path: typeof path;
    activeWindow?: activeWin.Result | {};
    // What shortcut key is pressed
    shortcutKey?: string;
};
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
        outputContentFileName: "README.md",
        outputImageDirPrefix: "img/",
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
        screenshotGiveUpRectangleMaxCount: 80,
        quoteFrom: "selectedText",
        DEBUG: false
    };
};
