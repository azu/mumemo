import * as Electron from "electron";
import { app, screen } from "electron";
import execa from "execa";
import { getReactFromImage, getReactFromImageResult, getReactFromImageResults } from "./detect";
import fs from "fs";
import Flatbush from "flatbush";
import activeWin from "active-win";
import Jimp from "jimp";
import * as path from "path";
import tmp from "tmp";
import { PreviewBrowser } from "./PreviewBrowser";
import dayjs from "dayjs";
import shortid from "shortid";
import sanitize from "sanitize-filename";
import * as os from "os";
import { copySelectedText } from "./macos/Keyboard";

const markdownEscapedCharaters = require("markdown-escapes");
const GfmEscape = require("gfm-escape");
const markdownEscaper = new GfmEscape();
const PImage = require("pureimage");
// const fnt = PImage.registerFont("~/Library/Fonts/Ricty-Bold.ttf", "Source Sans Pro");
// fnt.load(() => {});

async function calculateWrapperRect({
    rects,
    relativePoint,
    boundRatio,
    debugImage,
    debugContext,
    DEBUG,
    config,
}: {
    rects: getReactFromImageResult[];
    relativePoint: { x: number; y: number };
    debugImage: any;
    debugContext: any;
    DEBUG: boolean;
    boundRatio: number;
    config: AppConfig;
}) {
    const flatbush = new Flatbush(rects.length);
    const boundRects = rects.map((result) => {
        const ratio = boundRatio;
        const rect = result.rect;
        return {
            x: rect.x - rect.x * ratio,
            y: rect.y - rect.y * ratio,
            width: rect.width + rect.x * ratio * 2,
            height: rect.height + rect.y * ratio * 2,
        };
    });
    for (const boundRect of boundRects) {
        flatbush.add(boundRect.x, boundRect.y, boundRect.x + boundRect.width, boundRect.y + boundRect.height);
        if (DEBUG) {
            debugContext.fillStyle = "rgba(255,0,0,0.5)";
            debugContext.fillRect(boundRect.x, boundRect.y, boundRect.width, boundRect.height);
            // context.fillStyle = "#ffffff";
            // context.font = "12pt 'Source Sans Pro'";
            // context.fillText(
            //     `[${Math.round(boundRect.area)}, ${Math.round(boundRect.arcLength)}]`,
            //     boundRect.x,
            //     boundRect.y
            // );
        }
    }
    if (DEBUG) {
        try {
            await writePureImage(debugImage, path.join(config.debugOutputDir, "step3.png"));
        } catch {}
    }
    flatbush.finish();
    const rectangleSearchLimit = Math.round(Math.min(Math.max(2, boundRects.length / 2), 5));
    if (DEBUG) {
        console.log("Rectangle count: ", boundRects.length);
        console.log("rectangleSearchLimit:", rectangleSearchLimit);
    }
    const neighborIds = flatbush.neighbors(relativePoint.x, relativePoint.y, rectangleSearchLimit);
    const relatedBox = {
        minX: new Set<number>(),
        minY: new Set<number>(),
        maxX: new Set<number>(),
        maxY: new Set<number>(),
    };
    const hitIdSet = new Set<number>();
    neighborIds.forEach((id) => {
        hitIdSet.add(id);
        const reactFromImageResult = boundRects[id];
        {
            relatedBox.minX.add(reactFromImageResult.x);
            relatedBox.minY.add(reactFromImageResult.y);
            relatedBox.maxX.add(reactFromImageResult.x + reactFromImageResult.width);
            relatedBox.maxY.add(reactFromImageResult.y + reactFromImageResult.height);
        }
        if (DEBUG) {
            debugContext.fillStyle = "rgba(55,255,0,0.5)";
            debugContext.fillRect(
                reactFromImageResult.x,
                reactFromImageResult.y,
                reactFromImageResult.width,
                reactFromImageResult.height
            );
        }
        const recursive = (id: number) => {
            if (hitIdSet.has(id)) {
                return;
            }
            hitIdSet.add(id);
            const rectOfId = boundRects[id];
            const ids = flatbush.search(
                rectOfId.x,
                rectOfId.y,
                rectOfId.x + rectOfId.width,
                rectOfId.y + rectOfId.height
            );
            ids.forEach((boundId) => {
                const boundRect = boundRects[boundId];
                {
                    relatedBox.minX.add(boundRect.x);
                    relatedBox.minY.add(boundRect.y);
                    relatedBox.maxX.add(boundRect.x + boundRect.width);
                    relatedBox.maxY.add(boundRect.y + boundRect.height);
                }
                if (DEBUG) {
                    debugContext.fillStyle = "rgba(55,255,0,0.5)";
                    debugContext.fillRect(boundRect.x, boundRect.y, boundRect.width, boundRect.height);
                }
                recursive(boundId);
            });
        };
        recursive(id);
    });
    const resultBox = {
        minX: Math.round(Math.min(...relatedBox.minX)),
        minY: Math.round(Math.min(...relatedBox.minY)),
        maxX: Math.round(Math.max(...relatedBox.maxX)),
        maxY: Math.round(Math.max(...relatedBox.maxY)),
    };
    if (DEBUG) {
        debugContext.fillStyle = "rgba(0,255,255,0.5)";
        debugContext.fillRect(
            resultBox.minX,
            resultBox.minY,
            resultBox.maxX - resultBox.minX,
            resultBox.maxY - resultBox.minY
        );
    }
    return {
        wrapperRect: resultBox,
    };
}

export type AppConfig = {
    DEBUG: boolean;
    outputDir: string;
    outputContentTemplate: (args: OutputContentTemplateArgs) => string;
    autoFocus: boolean;
    autoSave: boolean;
    autoSaveTimeoutMs: number;
    debugOutputDir: string;
    boundRatio: number;
};
export type AppConfigCreatorArgs = { app: Electron.App; path: typeof path };
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
const createConfig = ({ app, path }: AppConfigCreatorArgs): AppConfig => {
    return {
        boundRatio: 0.2,
        // ~/Documents/mumemo
        outputDir: path.join(app.getPath("documents"), "mumemo"),
        // Output Template Function
        outputContentTemplate: ({ imgPath, selectedContent, inputContent }: OutputContentTemplateArgs) => {
            return `![](${imgPath})
${selectedContent.value ? `>  ${selectedContent.value.split("\n").join("\n> ")}\n` : ""}
${inputContent.raw ? inputContent.raw.trimRight() + "\n\n" : ""}`;
        },
        autoFocus: true,
        autoSave: true,
        autoSaveTimeoutMs: 5 * 1000,
        // DEBUG,
        DEBUG: false,
        debugOutputDir: path.join(app.getPath("documents"), "mumemo"),
    };
};
export const defaultAppConfig: AppConfig = createConfig({ app, path });

function writePureImage<T extends any>(debugImage: T, fileName: string) {
    return new Promise((resolve, reject) => {
        PImage.encodePNGToStream(debugImage, fs.createWriteStream(fileName))
            .then(() => {
                console.log("done writing", fileName);
                resolve();
            })
            .catch((error: any) => {
                reject(error);
            });
    });
}

function readPureImage(fileName: string): Promise<any> {
    return new Promise((resolve, reject) => {
        PImage.decodePNGFromStream(fs.createReadStream(fileName))
            .then((img: any) => {
                console.log("done reading", fileName);
                resolve(img);
            })
            .catch((error: any) => {
                reject(error);
            });
    });
}

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

const createFocusImage = async ({
    DEBUG,
    screenshotFileName,
    rectangles,
    currentScreenBounce,
    currentScreenSize,
    currentAbsolutePoint,
    displayScaleFactor,
    boundRatio,
    outputFileName,
    config,
}: {
    DEBUG: boolean;
    screenshotFileName: string;
    outputFileName: string;
    rectangles: getReactFromImageResults;
    currentScreenBounce: { x: number; y: number };
    currentScreenSize: { width: number; height: number };
    currentAbsolutePoint: { x: number; y: number };
    displayScaleFactor: number;
    boundRatio: number;
    config: AppConfig;
}) => {
    const img = await readPureImage(screenshotFileName);
    const debugImage = DEBUG ? PImage.make(img.width, img.height) : ({} as any);
    const context = DEBUG ? debugImage.getContext("2d") : ({} as any);
    if (DEBUG) {
        context.drawImage(
            img,
            0,
            0,
            img.width,
            img.height, // source dimensions
            0,
            0,
            img.width,
            img.height // destination dimensions
        );
    }
    const filteredRects = rectangles.filter((result) => {
        if (result.area < 100) {
            return false;
        }
        if (result.arcLength < 100) {
            return false;
        }
        if (result.rect.height < 8) {
            return false;
        }
        // if (result.rect.height < 30) {
        //     return false;
        // }
        const screenBoxAreaLimit = currentScreenSize.width * currentScreenSize.height * 0.8;
        if (result.area > screenBoxAreaLimit) {
            return false;
        }
        return true;
    });
    const relativePointCursorInScreen = {
        x: Math.abs(currentScreenBounce.x - currentAbsolutePoint.x * displayScaleFactor),
        y: Math.abs(currentScreenBounce.y - currentAbsolutePoint.y * displayScaleFactor),
    };
    // Draw Cursor
    if (DEBUG) {
        console.log("currentScreenBounce", currentScreenBounce);
        console.log("currentAbsolutePoint", currentAbsolutePoint);
        console.log("displayScaleFactor", displayScaleFactor);
        console.log("relativePointCursorInScreen", relativePointCursorInScreen);
        context.fillStyle = "rgba(255,0,255, 1)";
        context.fillRect(relativePointCursorInScreen.x, relativePointCursorInScreen.y, 25, 25);
    }
    const { wrapperRect } = await calculateWrapperRect({
        rects: filteredRects,
        relativePoint: relativePointCursorInScreen,
        boundRatio: boundRatio,
        debugContext: context,
        debugImage,
        DEBUG: DEBUG,
        config,
    });
    if (DEBUG) {
        context.fillStyle = "rgba(0,255,255,0.5)";
        context.fillRect(
            wrapperRect.minX,
            wrapperRect.minY,
            wrapperRect.maxX - wrapperRect.minX,
            wrapperRect.maxY - wrapperRect.minY
        );
    }
    // debug
    if (DEBUG) {
        await writePureImage(debugImage, path.join(defaultAppConfig.debugOutputDir, "step4.png"));
    }
    // result
    const image = await Jimp.read(screenshotFileName);
    // avoid overlap
    const imageWidth = image.getWidth();
    const imageHeight = image.getHeight();
    image.crop(
        wrapperRect.minX,
        wrapperRect.minY,
        Math.min(imageWidth - wrapperRect.minX, wrapperRect.maxX - wrapperRect.minX),
        Math.min(imageHeight - wrapperRect.minY, wrapperRect.maxY - wrapperRect.minY)
    );
    image.write(outputFileName);
    return {
        outputFilePath: outputFileName,
        outputImage: image,
    };
};

export const run = async (config: AppConfig, abortablePromise: Promise<void>) => {
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
    abortablePromise.catch(cancelTask);
    const race = <T extends any>(promise: Promise<T>): Promise<T> => {
        // on cancel
        return Promise.race([promise, abortablePromise]) as Promise<T>;
    };
    try {
        const DEBUG = config.DEBUG;
        const currentAbsolutePoint = screen.getCursorScreenPoint();
        const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const currentScreenSize = currentScreen.size;
        const currentScreenBounce = currentScreen.bounds;
        const displayScaleFactor = currentScreen.scaleFactor;
        const activeInfo = activeWin.sync();
        const temporaryScreenShot = tmp.fileSync({
            prefix: "mumemo",
            postfix: ".png",
        });
        const windowId = String(activeInfo?.id);
        console.log("active info", activeInfo);
        const screenshotFileName = DEBUG ? path.join(config.debugOutputDir, "step1.png") : temporaryScreenShot.name;
        const screenshotSuccess = await race(
            screenshot({
                screenshotFileName,
                windowId: windowId,
            })
        );
        if (!screenshotSuccess) {
            return;
        }
        const clipboardTextPromise = copySelectedText();
        const rectangles = await race(
            getReactFromImage(screenshotFileName, {
                debugOutputPath: DEBUG ? path.join(config.debugOutputDir, "step2.png") : undefined,
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
        const createOutputImageFileName = ({ owner, title }: { owner: string; title: string }) => {
            return `${owner}-${title}-${dayjs().format("YYYY-MM-DD")}-${shortid()}.png`;
        };
        const outputImageFileName = sanitizeFileName(
            createOutputImageFileName({
                owner: activeInfo?.owner.name ?? "unknown",
                title: activeInfo?.title ?? "unknown",
            })
        );
        const outputFileName = processingState.use(path.join(config.outputDir, outputImageFileName));
        const { outputImage } = await createFocusImage({
            DEBUG,
            rectangles,
            displayScaleFactor,
            currentAbsolutePoint,
            currentScreenBounce,
            currentScreenSize,
            screenshotFileName,
            outputFileName,
            boundRatio: config.boundRatio,
            config,
        });
        const outputImageBase64 = await outputImage.getBase64Async("image/png");
        previewBrowser.updateImage(outputImageBase64);
        const input = await previewBrowser.onClose({
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
            path.join(config.outputDir, "README.md"),
            config.outputContentTemplate({
                imgPath: outputImageFileName,
                inputContent,
                selectedContent,
            }),
            "utf-8"
        );
    } catch (error) {
        // when occur error{timeout,cancel}, cleanup it and suppress error
        await cancelTask();
    }
};
