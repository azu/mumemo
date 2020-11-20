import { screen } from "electron";
import execa from "execa";
import { createFocusImage, getReactFromImage } from "./detect";
import fs from "fs";
import Flatbush from "flatbush";
import Jimp from "jimp";
import * as path from "path";
import tmp from "tmp";
import { PreviewBrowser } from "./PreviewBrowser";
import dayjs, { Dayjs } from "dayjs";
import shortid from "shortid";
import sanitize from "sanitize-filename";
import * as os from "os";
import { copySelectedText } from "./macos/Clipboard";
import { OutputContentTemplateArgs, UserConfig } from "./Config";
import activeWin from "active-win";

// binary search for the first value in the array bigger than the given
function upperBound(value: any, arr: any) {
    let i = 0;
    let j = arr.length - 1;
    while (i < j) {
        const m = (i + j) >> 1;
        if (arr[m] > value) {
            j = m;
        } else {
            i = m + 1;
        }
    }
    return arr[i];
}

// @ts-ignore
Flatbush.prototype.overlap = function (this: Flatbush, minX: number, minY: number, maxX: number, maxY: number) {
    // @ts-ignore
    let nodeIndex = this._boxes.length - 4;
    const queue: number[] = [];
    const results: number[] = [];
    while (nodeIndex !== undefined) {
        // find the end index of the node
        // @ts-ignore
        const end = Math.min(nodeIndex + this.nodeSize * 4, upperBound(nodeIndex, this._levelBounds));
        // search through child nodes
        for (let pos = nodeIndex; pos < end; pos += 4) {
            // @ts-ignore
            const index = this._indices[pos >> 2] | 0;
            // @ts-ignore
            const nodeMinX = this._boxes[pos];
            // @ts-ignore
            const nodeMinY = this._boxes[pos + 1];
            // @ts-ignore
            const nodeMaxX = this._boxes[pos + 2];
            // @ts-ignore
            const nodeMaxY = this._boxes[pos + 3];
            // Overlap algorithm
            // https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection
            // check if node bbox intersects with query bbox
            if (minX < nodeMaxX && maxX > nodeMinX && minY < nodeMaxY && maxY > nodeMinY) {
                if (nodeIndex < this.numItems * 4) {
                    results.push(index);
                } else {
                    queue.push(index); // node; add it to the search queue
                }
            }
        }

        // @ts-ignore
        nodeIndex = queue.pop();
    }

    return results;
};
const markdownEscapedCharaters = require("markdown-escapes");
const GfmEscape = require("gfm-escape");
const markdownEscaper = new GfmEscape();
// const fnt = PImage.registerFont("~/Library/Fonts/Ricty-Bold.ttf", "Source Sans Pro");
// fnt.load(() => {});

async function screenshot({
    windowId,
    screenshotFileName,
}: {
    windowId: string | undefined;
    screenshotFileName: string;
}): Promise<boolean> {
    try {
        await execa("screencapture", (windowId ? ["-o", "-l", windowId] : ["-o"]).concat(screenshotFileName));
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

export type AppConfig = UserConfig & {
    outputDir: string;
};
export const run = async ({
    config,
    activeWindow,
    abortSignal,
}: {
    config: AppConfig;
    activeWindow: activeWin.Result;
    abortSignal: AbortSignal;
}) => {
    const processingState = {
        needCleanUpFiles: [] as string[],
        clean() {
            processingState.needCleanUpFiles.forEach((fileName) => {
                try {
                    fs.unlinkSync(fileName);
                } catch (error) {
                    if (config.DEBUG) {
                        console.error(error);
                    }
                }
            });
        },
        use<T extends string>(fileName: T): T {
            processingState.needCleanUpFiles.push(fileName);
            return fileName;
        },
    };
    // on abort
    let isCanceled = false;
    const cancelTask = async () => {
        if (isCanceled) {
            return;
        }
        isCanceled = true;
        const previewBrowser = await PreviewBrowser.instance();
        previewBrowser.cancel();
        // clean non-saved files
        processingState.clean();
    };
    abortSignal.addEventListener("abort", () => cancelTask(), {
        once: true,
    });
    const race = <T extends any>(promise: Promise<T>): Promise<T> => {
        if (abortSignal.aborted) {
            return Promise.reject(new Error("Cancel"));
        }
        // on cancel
        return promise as Promise<T>;
    };
    try {
        const DEBUG = config.DEBUG;
        const currentAbsolutePoint = screen.getCursorScreenPoint();
        const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const currentScreenSize = currentScreen.size;
        const currentScreenBounce = currentScreen.bounds;
        const displayScaleFactor = currentScreen.scaleFactor;
        const temporaryScreenShot = tmp.fileSync({
            prefix: "mumemo",
            postfix: ".png",
        });
        const windowId = activeWindow.id;
        if (!windowId) {
            console.error("Not found active window id");
            return cancelTask();
        }
        const screenshotFileName = DEBUG ? path.join(config.outputDir, "_debug-step1.png") : temporaryScreenShot.name;
        const screenshotSuccess = await race(
            screenshot({
                screenshotFileName,
                windowId: String(windowId),
            })
        );
        if (!screenshotSuccess) {
            return;
        }
        const clipboardTextPromise = copySelectedText();
        const rectangles = await race(
            getReactFromImage(screenshotFileName, {
                debugOutputPath: DEBUG ? path.join(config.outputDir, "_debug-step2.png") : undefined,
            })
        );
        // Fast Preview
        const previewBrowser = await PreviewBrowser.instance();
        previewBrowser.reset();
        const firstImage = await Jimp.read(screenshotFileName);
        const firstImageBase64 = await firstImage.getBase64Async("image/png");
        previewBrowser.edit(``, firstImageBase64);
        // get clipboard text and show window as interactive
        let clipboardText = "";
        if (config.autoFocus) {
            clipboardText = (await clipboardTextPromise) || "";
            previewBrowser.show();
        } else {
            previewBrowser.showInactive();
            clipboardText = (await clipboardTextPromise) || "";
        }
        // Update with Focus Image
        const sanitizeFileName = (name: string): string => {
            const homedir = os.homedir();
            const stripedNamed: string = [homedir, markdownEscapedCharaters].reduce((result, escapeCharacter) => {
                return result.split(escapeCharacter).join("");
            }, name);
            const spaceToUnderBar = stripedNamed.replace(/\s/g, "_");
            return sanitize(spaceToUnderBar);
        };
        const createOutputImageFileName = ({
            dayjs,
            owner,
            title,
            id,
        }: {
            dayjs: Dayjs;
            owner: string;
            title: string;
            id: string;
        }) => {
            return `${dayjs.format("YYYY-MM-DD")}-${owner}-${title}-${id}.png`;
        };
        const outputImageFileName = sanitizeFileName(
            createOutputImageFileName({
                id: shortid(),
                dayjs: dayjs(),
                owner: activeWindow?.owner.name ?? "unknown",
                title: activeWindow?.title ?? "unknown",
            })
        );
        const outputFileName = processingState.use(
            path.join(config.outputDir, config.outputImageDirPrefix, outputImageFileName)
        );
        const { outputImage } = await createFocusImage({
            DEBUG,
            rectangles,
            displayScaleFactor,
            currentAbsolutePoint,
            currentScreenBounce,
            currentScreenSize,
            screenshotFileName,
            outputFileName,
            screenshotBoundRatio: config.screenshotBoundRatio,
            config,
        });
        const outputImageBase64 = await outputImage.getBase64Async("image/png");
        previewBrowser.updateImage(outputImageBase64);
        const input = await previewBrowser.waitForInput({
            imgSrc: outputImageBase64,
            autoSave: config.autoSave,
            timeoutMs: config.autoSaveTimeoutMs,
        });
        const inputContent: OutputContentTemplateArgs["inputContent"] = {
            raw: input,
            value: markdownEscaper.escape(input),
        };
        const selectedContent: OutputContentTemplateArgs["selectedContent"] = {
            raw: clipboardText.trim(),
            value: markdownEscaper.escape(clipboardText.trim()),
        };
        fs.appendFileSync(
            path.join(config.outputDir, config.outputContentFileName),
            config.outputContentTemplate({
                imgPath: path.join(config.outputImageDirPrefix, outputImageFileName),
                inputContent,
                selectedContent,
            }),
            "utf-8"
        );
    } catch (error) {
        if (config.DEBUG) {
            console.log(error.message);
        }
        // when occur error{timeout,cancel}, cleanup it and suppress error
        await cancelTask();
    }
};
