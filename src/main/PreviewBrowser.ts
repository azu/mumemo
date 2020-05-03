import { BrowserWindow, ipcMain } from "electron";
import windowStateKeeper from "electron-window-state";
import path from "path";
import { format as formatUrl } from "url";
import { Deferred } from "./Deferred";

const Positioner = require("electron-positioner");

const isDevelopment = process.env.NODE_ENV !== "production";

let _PreviewBrowser: PreviewBrowser | null = null;

export class PreviewBrowser {
    private mainWindow: Electron.BrowserWindow | null;
    private inputValue: string;
    private closedDeferred: Deferred<void>;
    private forcusAtOnce: boolean;
    private canceled: boolean;
    private timeoutId: NodeJS.Timeout | null;

    get isDeactived() {
        return this.mainWindow === null;
    }

    static async instance(): Promise<PreviewBrowser> {
        if (_PreviewBrowser) {
            return _PreviewBrowser;
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
        this.canceled = false;
        this.timeoutId = null;
    }

    reset() {
        this.mainWindow?.webContents.send("reset");
        this.inputValue = "";
        this.closedDeferred.resolve();
        this.closedDeferred = new Deferred<void>();
        this.forcusAtOnce = false;
        this.canceled = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
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
            webPreferences: { nodeIntegration: true, webSecurity: true },
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

    cancel() {
        this.canceled = true;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }

    // resolve this promise then save text
    async onClose(timeoutMs: number): Promise<string> {
        return new Promise((resolve) => {
            // focus at once, not timeout
            // timeout -> hide and save -> reset
            this.timeoutId = setTimeout(() => {
                if (!this.forcusAtOnce && !this.canceled) {
                    this.hide();
                    resolve();
                }
            }, timeoutMs);
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
