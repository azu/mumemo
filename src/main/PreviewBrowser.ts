import { BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import path from "path";
import { format as formatUrl } from "url";
import { timeout } from "./timeout";

const Positioner = require("electron-positioner");

const isDevelopment = process.env.NODE_ENV !== "production";

let _PreviewBrowser: PreviewBrowser | null = null;

class Deferred<T extends any> {
    promise: Promise<T>;
    private _resolve!: (value?: T) => void;
    private _reject!: (reason?: Error) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    resolve(value?: any) {
        this._resolve(value);
    }

    reject(reason?: Error) {
        this._reject(reason);
    }
}

export class PreviewBrowser {
    private mainWindow: Electron.BrowserWindow | null;
    private inputValue: string;
    private closedDeferred: Deferred<void>;
    private forcusAtOnce: boolean;

    get isDeactived() {
        return this.mainWindow === null;
    }

    static async instance(): Promise<PreviewBrowser> {
        if (_PreviewBrowser) {
            return _PreviewBrowser.reset();
        }
        const instance = new PreviewBrowser();
        return new Promise((resolve) => {
            instance.mainWindow?.webContents.on("did-finish-load", function () {
                _PreviewBrowser = instance;
                resolve(_PreviewBrowser);
            });
        });
    }

    constructor() {
        this.mainWindow = this.createMainWindow();
        this.inputValue = "";
        this.closedDeferred = new Deferred<void>();
        this.forcusAtOnce = false;
    }

    reset() {
        this.inputValue = "";
        this.closedDeferred.resolve();
        this.closedDeferred = new Deferred<void>();
        this.forcusAtOnce = false;
        return this;
    }

    createMainWindow() {
        const mainWindowState = windowStateKeeper({
            defaultWidth: 320,
            defaultHeight: 320,
        });
        const browserWindow = new BrowserWindow({
            frame: false,
            x: mainWindowState.x,
            y: mainWindowState.y,
            width: mainWindowState.width,
            height: mainWindowState.height,
            webPreferences: { nodeIntegration: true, webSecurity: false },
        });
        if (isDevelopment) {
            browserWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
        } else {
            browserWindow.loadURL(
                formatUrl({
                    pathname: path.join(__dirname, "index.html"),
                    protocol: "file",
                    slashes: true,
                })
            );
        }

        const positioner = new Positioner(browserWindow);
        if (mainWindowState.y === undefined || mainWindowState.x === undefined) {
            positioner.move("topRight");
        }
        browserWindow.on("close", (event) => {
            event.preventDefault();
            this.hide();
            this.closedDeferred.resolve();
        });
        browserWindow.on("focus", () => {
            this.forcusAtOnce = true;
        });
        browserWindow.on("closed", () => {
            this.mainWindow = null;
        });
        ipcMain.on("save", (event, value: string) => {
            this.inputValue = value;
            browserWindow.close();
        });
        mainWindowState.manage(browserWindow);
        return browserWindow;
    }

    edit(value: string, imgSrc: string) {
        this.mainWindow?.webContents.send("update", value, imgSrc);
        this.show();
    }

    updateImage(imgSrc: string) {
        this.mainWindow?.webContents.send("update:image", imgSrc);
    }

    // resolve this promise then save text
    async onClose() {
        return new Promise((resolve) => {
            // focus at once, not timeout
            // timeout -> hide and save -> reset
            timeout(5000).then(() => {
                if (!this.forcusAtOnce) {
                    this.hide();
                    resolve();
                }
            });
            // save -> save
            this.closedDeferred.promise.then(() => {
                resolve(this.inputValue);
            });
        });
    }

    show() {
        if (this.mainWindow) {
            this.mainWindow.showInactive();
        }
    }

    hide() {
        if (this.mainWindow) {
            this.mainWindow.hide();
        }
    }

    close() {
        if (this.mainWindow) {
            this.mainWindow.destroy();
        }
        this.mainWindow = null;
    }
}
