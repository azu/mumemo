import { app, globalShortcut, Notification, nativeImage, screen } from "electron";
import execa from "execa";
import { getReactFromImage } from "./detect";
import fs from "fs";
import Flatbush from 'flatbush';
import activeWin from "active-win";
import Jimp from "jimp";

const PImage = require("pureimage");
const fnt = PImage.registerFont('/Users/azu/Library/Fonts/Ricty-Bold.ttf', 'Source Sans Pro');
fnt.load(() => {

});
app.on('ready', () => {
    const DEBUG = true;
    // Register a 'CommandOrControl+X' shortcut listener.
    const ret = globalShortcut.register('CommandOrControl+Shift+X', async () => {
        console.log('CommandOrControl+Shift+X is pressed')
        try {
            const currentPoint = screen.getCursorScreenPoint()
            const displayScaleFactor = screen.getPrimaryDisplay().scaleFactor;
            const activeInfo = activeWin.sync();
            const id = String(activeInfo?.id);
            await execa("screencapture", (id ? ["-o", "-l", id] : ["-o"]).concat("/Users/azu/Downloads/a.png"));
            const results = await getReactFromImage("/Users/azu/Downloads/a.png", {
                debugOutputPath: DEBUG ? "/Users/azu/Downloads/b.png" : undefined
            });
            const notification = new Notification({
                title: "mumemo",
                body: "update memo",
                icon: nativeImage.createFromPath("/Users/azu/Downloads/a.png"),
                hasReply: true
            });
            notification.addListener("reply", (event, index) => {
                console.log(event, index);
            });
            notification.show();
            await new Promise((resolve, reject) => {
                PImage.decodePNGFromStream(fs.createReadStream("/Users/azu/Downloads/a.png")).then(async (img: any) => {
                    const debugImage = DEBUG ? PImage.make(img.width, img.height) : {} as any;
                    const context = DEBUG ? debugImage.getContext("2d") : {} as any;
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
                    const filteredResults = results.filter((result) => {
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
                        if (result.area > 1024 * 1024) {
                            return false;
                        }
                        return true;
                    });
                    filteredResults.forEach((result) => {
                        // const react = result.rect;
                        // const ratio = 0.2;
                        // context.fillStyle = "rgba(255,0,0,0.5)";
                        // context.fillRect(
                        //     react.x - react.x * ratio,
                        //     react.y - react.y * ratio,
                        //     react.width + react.x * ratio * 2,
                        //     react.height + react.y * ratio * 2
                        // );
                        // context.fillStyle = '#ffffff';
                        // context.font = "12pt 'Source Sans Pro'";
                        // context.fillText(`[${Math.round(result.area)}, ${Math.round(result.arcLength)}]`, react.x, react.y);
                    });
                    console.log("point", currentPoint)
                    if (DEBUG) {
                        context.fillStyle = "rgba(255,0,255, 1)"
                    }
                    // Window Screenshot has bounds
                    // Add bounds to the rect
                    const windowBounces = {
                        x: activeInfo?.bounds.x ?? 0,
                        y: activeInfo?.bounds.y ?? 0,
                    }
                    const absoluteCursolInWindow = {
                        x: windowBounces.x + currentPoint.x * displayScaleFactor,
                        y: windowBounces.y + currentPoint.y * displayScaleFactor
                    };
                    if (DEBUG) {
                        context.fillRect(
                            absoluteCursolInWindow.x,
                            absoluteCursolInWindow.y,
                            25,
                            25
                        );
                    }
                    {
                        const flatbush = new Flatbush(filteredResults.length);
                        const boundRects = filteredResults.map(result => {
                            const ratio = 0.2;
                            const react = result.rect;
                            return {
                                x: react.x - react.x * ratio,
                                y: react.y - react.y * ratio,
                                width: react.width + react.x * ratio * 2,
                                height: react.height + react.y * ratio * 2
                            };

                        })
                        for (const result of boundRects) {
                            flatbush.add(result.x, result.y, result.x + result.width, result.y + result.height);
                        }
                        flatbush.finish();
                        const neighborIds = flatbush.neighbors(
                            absoluteCursolInWindow.x,
                            absoluteCursolInWindow.y,
                            5);
                        console.log("neighborIds", neighborIds);
                        const relatedBox = {
                            minX: new Set<number>(),
                            minY: new Set<number>(),
                            maxX: new Set<number>(),
                            maxY: new Set<number>()
                        };
                        const hitIdSet = new Set<number>();
                        neighborIds.forEach(id => {
                            hitIdSet.add(id);
                            const reactFromImageResult = boundRects[id];
                            {
                                relatedBox.minX.add(reactFromImageResult.x);
                                relatedBox.minY.add(reactFromImageResult.y);
                                relatedBox.maxX.add(reactFromImageResult.x + reactFromImageResult.width);
                                relatedBox.maxY.add(reactFromImageResult.y + reactFromImageResult.height);
                            }
                            const rect = reactFromImageResult;
                            if (DEBUG) {
                                context.fillStyle = "rgba(255,0,0,0.1)";
                                context.fillRect(
                                    rect.x,
                                    rect.y,
                                    rect.width,
                                    rect.height
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
                                ids.forEach(boundId => {
                                    const boundRect = boundRects[boundId];
                                    {
                                        relatedBox.minX.add(boundRect.x);
                                        relatedBox.minY.add(boundRect.y);
                                        relatedBox.maxX.add(boundRect.x + boundRect.width);
                                        relatedBox.maxY.add(boundRect.y + boundRect.height);
                                    }
                                    recursive(boundId);
                                    if (DEBUG) {
                                        context.fillStyle = "rgba(255,0,255,0.2)"
                                        context.fillRect(
                                            boundRect.x,
                                            boundRect.y,
                                            boundRect.width,
                                            boundRect.height
                                        );
                                    }
                                })
                            }
                            recursive(id);
                        });
                        const resultBox = {
                            minX: Math.round(Math.min(...relatedBox.minX)),
                            minY: Math.round(Math.min(...relatedBox.minY)),
                            maxX: Math.round(Math.max(...relatedBox.maxX)),
                            maxY: Math.round(Math.max(...relatedBox.maxY))
                        };
                        if (DEBUG) {
                            context.fillStyle = "rgba(0,255,255,0.5)";
                            context.fillRect(
                                resultBox.minX,
                                resultBox.minY,
                                resultBox.maxX - resultBox.minX,
                                resultBox.maxY - resultBox.minY
                            );
                        }
                        {
                            const image = await Jimp.read('/Users/azu/Downloads/a.png');
                            // avoid overlap
                            const imageWidth = image.getWidth();
                            const imageHeight = image.getHeight();
                            image.crop(
                                resultBox.minX,
                                resultBox.minY,
                                Math.min(imageWidth - resultBox.minX, resultBox.maxX - resultBox.minX),
                                Math.min(imageHeight - resultBox.minY, resultBox.maxY - resultBox.minY)
                            )
                            image.write("/Users/azu/Downloads/d.png")
                        }
                    }
                    if (DEBUG) {
                        PImage.encodePNGToStream(debugImage, fs.createWriteStream("/Users/azu/Downloads/c.png"))
                            .then(() => {
                                console.log("done writing");
                                resolve();
                            })
                            .catch((error: any) => {
                                reject(error);
                            });
                    } else {
                        resolve();
                    }
                });
            })
        } catch (error) {
            console.error(error);
        }
    })

    if (!ret) {
        console.log('registration failed')
    }

    // Check whether a shortcut is registered.
    console.log(globalShortcut.isRegistered('CommandOrControl+X'))
})

app.on('will-quit', () => {
    // Unregister a shortcut.
    globalShortcut.unregister('CommandOrControl+X')

    // Unregister all shortcuts.
    globalShortcut.unregisterAll()
})
