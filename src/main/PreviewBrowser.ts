import { BrowserWindow } from "electron";
import windowStateKeeper from "electron-window-state";
import path from "path";
import { format as formatUrl } from "url";

const Positioner = require("electron-positioner");

const isDevelopment = process.env.NODE_ENV !== "production";

let _PreviewBrowser: PreviewBrowser | null = null;

export class PreviewBrowser {
    private mainWindow: Electron.BrowserWindow | null;

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
        browserWindow.on("close", () => {
            this.hide();
        });
        browserWindow.on("closed", () => {
            this.mainWindow = null;
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

    show() {
        if (this.mainWindow) {
            this.mainWindow.show();
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
