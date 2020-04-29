import { app, globalShortcut, Notification, nativeImage, screen } from "electron";
import execa from "execa";
import { getReactFromImage, getReactFromImageResult } from "./detect";
import fs from "fs";
import Flatbush from "flatbush";
import activeWin from "active-win";
import Jimp from "jimp";
import * as path from "path";
import tmp from "tmp";

const PImage = require("pureimage");
const fnt = PImage.registerFont("/Users/azu/Library/Fonts/Ricty-Bold.ttf", "Source Sans Pro");
fnt.load(() => {});

async function calculateWrapperRect({
    rects,
    relativePoint,
    boundRatio,
    debugImage,
    debugContext,
    DEBUG,
}: {
    rects: getReactFromImageResult[];
    relativePoint: { x: number; y: number };
    debugImage: any;
    debugContext: any;
    DEBUG: boolean;
    boundRatio: number;
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

type Config = {
    DEBUG: boolean;
    outputDir: string;
    debugOutputDir: string;
    shortcutKey: string;
    boundRatio: number;
};
const config: Config = {
    DEBUG: true,
    outputDir: app.getPath("downloads"),
    debugOutputDir: app.getPath("downloads"),
    shortcutKey: "CommandOrControl+Shift+X",
    boundRatio: 0.2,
};

function writePureImage<T extends any>(debugImage: T, fileName: string) {
    return new Promise((resolve, reject) => {
        PImage.encodePNGToStream(debugImage, fs.createWriteStream(fileName))
            .then(() => {
                console.log("done writing");
                resolve();
            })
            .catch((error: any) => {
                reject(error);
            });
    });
}

app.on("ready", () => {
    const DEBUG = config.DEBUG;
    const boundRatio = config.boundRatio;
    // Register a 'CommandOrControl+X' shortcut listener.
    let processing = false;
    const ret = globalShortcut.register(config.shortcutKey, async () => {
        console.log(`${config.shortcutKey} is pressed`);
        const temporaryScreenShot = tmp.fileSync({
            prefix: "mumemo",
            postfix: ".png",
        });
        try {
            if (processing) {
                return;
            }
            processing = true;
            const currentAbsolutePoint = screen.getCursorScreenPoint();
            const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
            const currentScreenSize = currentScreen.size;
            const currentScreenBounce = currentScreen.bounds;
            const displayScaleFactor = currentScreen.scaleFactor;
            const activeInfo = activeWin.sync();
            const id = String(activeInfo?.id);
            const screenshotFileName = DEBUG ? path.join(config.debugOutputDir, "step1.png") : temporaryScreenShot.name;
            await execa("screencapture", (id ? ["-o", "-l", id] : ["-o"]).concat(screenshotFileName));
            const results = await getReactFromImage(screenshotFileName, {
                debugOutputPath: DEBUG ? path.join(config.debugOutputDir, "step2.png") : undefined,
            });
            const notification = new Notification({
                title: "mumemo",
                body: "update memo",
                icon: nativeImage.createFromPath(screenshotFileName),
                hasReply: true,
            });
            notification.addListener("reply", (event, index) => {
                console.log(event, index);
            });
            notification.show();
            await new Promise((resolve, reject) => {
                PImage.decodePNGFromStream(fs.createReadStream(screenshotFileName)).then(async (img: any) => {
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
                    const filteredRects = results.filter((result) => {
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
                        try {
                            await writePureImage(debugImage, path.join(config.debugOutputDir, "step4.png"));
                        } catch (error) {
                            reject(error);
                        }
                    }
                    // result
                    {
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
                        image.write(path.join(config.outputDir, "output.png"));
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error(error);
        } finally {
            temporaryScreenShot.removeCallback();
            processing = false;
        }
    });

    if (!ret) {
        console.log("registration failed");
    }

    // Check whether a shortcut is registered.
    console.log(globalShortcut.isRegistered("CommandOrControl+X"));
});

app.on("will-quit", () => {
    // Unregister a shortcut.
    globalShortcut.unregister("CommandOrControl+X");

    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});
