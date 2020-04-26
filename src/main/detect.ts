import Jimp from "jimp";

const { cv } = require("opencv-wasm");
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
        },
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
                rect: cv.boundingRect(contours.get(i)),
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
            data: Buffer.from(src.data),
        }).write(options.debugOutputPath);
    }
    release();
    return results;
};
