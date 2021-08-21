import Jimp from "jimp";

/**
 *
 * @param screenshotFileName input
 * @param resizedScreenshotFileName output
 * @param resizeSize
 * @param DEBUG
 */
export async function resizeScreenShotFitCurrentScreenBound({
    screenshotFileName,
    resizedScreenshotFileName,
    resizeSize,
    DEBUG
}: {
    screenshotFileName: string;
    resizedScreenshotFileName: string;
    resizeSize: { width: number; height: number };
    DEBUG?: boolean;
}): Promise<string> {
    const jimp = await Jimp.read(screenshotFileName);
    await jimp.resize(resizeSize.width, resizeSize.height);
    await jimp.writeAsync(resizedScreenshotFileName);
    return resizedScreenshotFileName;
}
