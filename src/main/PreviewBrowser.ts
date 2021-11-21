import { BrowserWindow, ipcMain, clipboard, nativeImage } from "electron";
import path from "path";
import { format as formatUrl } from "url";
import { Deferred } from "./Deferred";
import { UserConfig } from "./Config";
import WinState from "electron-win-state";

const isDevelopment = process.env.NODE_ENV !== "production";

let _PreviewBrowser: PreviewBrowser | null = null;

export class PreviewBrowser {
    private mainWindow: Electron.BrowserWindow | null;
    private closedDeferred: Deferred<string>;
    private focusAtOnce: boolean;
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
            instance.mainWindow?.webContents.on("did-finish-load", function() {
                _PreviewBrowser = instance;
                resolve(_PreviewBrowser);
            });
        });
    }

    constructor() {
        this.mainWindow = this.createMainWindow();
        this.closedDeferred = new Deferred<string>();
        this.focusAtOnce = false;
        this.canceled = false;
        this.timeoutId = null;
    }

    reset() {
        this.mainWindow?.webContents.send("reset");
        this.closedDeferred = new Deferred<string>();
        this.focusAtOnce = false;
        this.canceled = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
        return this;
    }

    createMainWindow() {
        const winState = new WinState({
            defaultWidth: 320,
            defaultHeight: 320,
            dev: isDevelopment
        });
        const browserWindow = new BrowserWindow({
            ...winState.winOptions,
            webPreferences: { nodeIntegration: true, contextIsolation: false },
            frame: false,
            alwaysOnTop: true
        });
        if (isDevelopment) {
            browserWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
        } else {
            browserWindow.loadURL(
                formatUrl({
                    pathname: path.join(__dirname, "index.html"),
                    protocol: "file",
                    slashes: true
                })
            );
        }
        browserWindow.on("close", (event) => {
            event.preventDefault();
            this.hide();
            this.closedDeferred.reject(new Error("Close Window"));
        });
        browserWindow.on("focus", () => {
            this.focusAtOnce = true;
        });
        browserWindow.on("closed", () => {
            this.mainWindow = null;
        });
        winState.manage(browserWindow);
        require("@electron/remote/main").enable(browserWindow.webContents);
        return browserWindow;
    }

    edit(value: string, imgSrc: string) {
        this.mainWindow?.webContents.send("update", value, imgSrc);
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
    async waitForInput({
                           imgSrc,
                           timeoutMs,
                           autoSave
                       }: {
        imgSrc: string;
        timeoutMs: number;
        autoSave: boolean;
    }): Promise<string> {
        const onCancel = () => {
            this.closedDeferred.reject(new Error("Cancel by user"));
            this.mainWindow?.close();
        };
        const onSave = (_event: any, value: string) => {
            this.closedDeferred.resolve(value);
            this.mainWindow?.close();
        };
        const onCopy = (_event: any, value: string) => {
            clipboard.write({
                text: value,
                image: nativeImage.createFromDataURL(imgSrc)
            });
        };
        return new Promise((resolve, reject) => {
            ipcMain.once("save", onSave);
            ipcMain.once("cancel", onCancel);
            ipcMain.addListener("copy", onCopy);
            // focus at once, not timeout
            // timeout -> hide and save -> reset
            this.timeoutId = setTimeout(() => {
                if (!this.focusAtOnce && !this.canceled) {
                    this.hide();
                    if (autoSave) {
                        this.closedDeferred.resolve("");
                    } else {
                        this.closedDeferred.reject(new Error("timeout"));
                    }
                }
            }, timeoutMs);
            // save -> save
            this.closedDeferred.promise
                .then((value) => {
                    resolve(value);
                })
                .catch((error) => {
                    reject(error);
                })
                .finally(() => {
                    ipcMain.off("save", onSave);
                    ipcMain.off("cancel", onCancel);
                    ipcMain.off("copy", onCopy);
                });
        });
    }

    show(config: UserConfig) {
        if (this.mainWindow) {
            this.focusAtOnce = true;
            this.mainWindow.show();
        }
    }

    showInactive(config: UserConfig) {
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
