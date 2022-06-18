import Jimp from "jimp";
import path from "path";
import { AppConfig } from "./app";
import fs from "fs";
import Flatbush from "flatbush";
import * as PImage from "pureimage";
// @ts-expect-error
import { cv } from "opencv-wasm";
import { Bitmap } from "pureimage/types/bitmap";
// add overlap
declare type FlatbushAddtional = {
    overlap(this: Flatbush, minX: number, minY: number, maxX: number, maxY: number): number[];
};

export type getReactFromImageResults = getReactFromImageResult[];
type Rect = {
    width: number;
    height: number;
    x: number;
    y: number;
};
export type getReactFromImageResult = {
    rect: Rect;
    arcLength: number;
    area: number;
    minAreaRect: {
        angle: number;
        center: {
            x: number;
            y: number;
        };
        size: {
            height: number;
            width: number;
        };
    };
};
type Deletable = { delete(): void };
const createInter = () => {
    const set = new Set<Deletable>();
    return {
        use<T extends Deletable>(target: T): T {
            set.add(target);
            return target;
        },
        release() {
            set.forEach((target) => {
                try {
                    target.delete();
                } catch (error) {
                    console.error(target, "is not deletable");
                    throw error;
                }
            });
        }
    };
};

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

export function writePureImage<T extends Bitmap>(debugImage: T, fileName: string) {
    return new Promise<void>((resolve, reject) => {
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

export async function calculateWrapperRect({
    rects,
    relativePoint,
    screenshotBoundRatio,
    displayScaleFactor,
    debugImage,
    debugContext,
    currentScreenSize,
    DEBUG,
    config
}: {
    rects: getReactFromImageResult[];
    relativePoint: { x: number; y: number };
    debugImage: any;
    debugContext: any;
    DEBUG: boolean;
    currentScreenSize: { width: number; height: number };
    displayScaleFactor: number;
    screenshotBoundRatio: number;
    config: AppConfig;
}) {
    if (DEBUG) {
        if (screenshotBoundRatio < 0) {
            console.warn("boundRatio should be >= 0");
        }
    }
    const flatbush = new Flatbush(rects.length) as Flatbush & FlatbushAddtional;
    const boundRects = rects.map((result) => {
        const rect = result.rect;
        const paddingX = Math.round(rect.x * (screenshotBoundRatio - 1));
        const paddingY = Math.round(rect.y * (screenshotBoundRatio - 1));
        return {
            x: rect.x - paddingX,
            y: rect.y - paddingY,
            width: rect.width + paddingX * 2,
            height: rect.height + paddingY * 2
        };
    });
    if (boundRects.length > config.screenshotGiveUpRectangleMaxCount) {
        if (DEBUG) {
            console.log("Give up to create focus image because boundRects count is " + boundRects.length);
        }
        return {
            wrapperRect: {
                minX: 0,
                minY: 0,
                maxX: currentScreenSize.width * displayScaleFactor,
                maxY: currentScreenSize.height * displayScaleFactor
            }
        };
    }
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
            await writePureImage(debugImage, path.join(config.outputDir, "_debug-step3.png"));
        } catch {}
    }
    flatbush.finish();
    const rectangleSearchLimit = Math.round(
        Math.min(Math.max(2, boundRects.length / 2), config.screenshotSearchRectangleMaxCount)
    );
    if (DEBUG) {
        console.log("Rectangle count: ", boundRects.length);
        console.log("rectangleSearchLimit:", rectangleSearchLimit);
    }
    const neighborIds = flatbush.neighbors(relativePoint.x, relativePoint.y, rectangleSearchLimit);
    const relatedBox = {
        minX: new Set<number>(),
        minY: new Set<number>(),
        maxX: new Set<number>(),
        maxY: new Set<number>()
    };
    const hitIdSet = new Set<number>();
    neighborIds.forEach((id) => {
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
            const ids = flatbush.overlap(
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
        maxY: Math.round(Math.max(...relatedBox.maxY))
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
        wrapperRect: resultBox
    };
}

export const createFocusImage = async ({
    DEBUG,
    screenshotFileName,
    rectangles,
    currentScreenBounce,
    currentScreenSize,
    currentAbsolutePoint,
    displayScaleFactor,
    screenshotBoundRatio,
    outputFileName,
    config
}: {
    DEBUG: boolean;
    screenshotFileName: string;
    outputFileName: string;
    rectangles: getReactFromImageResults;
    currentScreenBounce: { x: number; y: number };
    currentScreenSize: { width: number; height: number };
    currentAbsolutePoint: { x: number; y: number };
    displayScaleFactor: number;
    screenshotBoundRatio: number;
    config: AppConfig;
}) => {
    const img = await readPureImage(screenshotFileName);
    // @ts-expect-error: wrong type
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
        y: Math.abs(currentScreenBounce.y - currentAbsolutePoint.y * displayScaleFactor)
    };
    // Draw Cursor
    if (DEBUG) {
        console.log("currentScreenSize", currentScreenSize);
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
        displayScaleFactor,
        screenshotBoundRatio: screenshotBoundRatio,
        currentScreenSize,
        debugContext: context,
        debugImage,
        DEBUG: DEBUG,
        config
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
        await writePureImage(debugImage, path.join(config.outputDir, "_debug-step4.png"));
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
        outputImage: image
    };
};

export type getReactFromImageOptions = {
    debug?: boolean;
    debugOutputPath?: string;
};
export const getReactFromImage = async (imagePath: string, options: getReactFromImageOptions = {}) => {
    const impSrc = await Jimp.read(imagePath);
    const { use, release } = createInter();
    const results: getReactFromImageResults = [];
    const src = cv.matFromImageData(impSrc.bitmap);
    const dst = use(new cv.Mat());
    {
        const M = use(cv.Mat.ones(5, 5, cv.CV_8U));
        const anchor = new cv.Point(-1, -1);
        cv.dilate(src, dst, M, anchor, 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        // to Grayscale
        cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY);
        // to binary
        cv.threshold(dst, dst, 0, 255, cv.THRESH_BINARY + cv.THRESH_TRIANGLE);
        // find contours
        const contours = use(new cv.MatVector());
        const hierarchy = use(new cv.Mat());
        cv.findContours(dst, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
        for (let i = 0; i < contours.size(); ++i) {
            const arcLength = cv.arcLength(contours.get(i), true);
            const area = cv.contourArea(contours.get(i));
            const minAreaRect = cv.minAreaRect(contours.get(i));
            results.push({
                area: area,
                arcLength: arcLength,
                minAreaRect,
                rect: cv.boundingRect(contours.get(i))
            });
            if (options.debugOutputPath) {
                const contoursColor = new cv.Scalar(255, 0, 0, 255);
                cv.drawContours(src, contours, i, contoursColor, 5, 1, hierarchy, 0);
            }
        }
    }
    // Jimp only support RGC
    // Need to gray to RGC before passing jimp
    if (options.debugOutputPath) {
        cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGB);
        new Jimp({
            width: src.cols,
            height: src.rows,
            data: Buffer.from(src.data)
        }).write(options.debugOutputPath);
    }
    release();
    return results;
};
