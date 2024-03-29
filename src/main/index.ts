import { app, dialog, globalShortcut, Menu, Tray, shell, BrowserWindow } from "electron";
import { timeout } from "./timeout";
import activeWin from "active-win";
import { createUserConfig, defaultShortcutKey, MumemoConfigFile } from "./Config";
import path from "path";
import { AppConfig, run } from "./app";
import * as fs from "fs";
import Store from "electron-store";
import log from "electron-log";
import OpenDialogOptions = Electron.OpenDialogOptions;

require("@electron/remote/main").initialize();
const store = new Store();
Object.assign(console, log.functions);
// mumemo://
app.setAsDefaultProtocolClient("mumemo");

/*
const urlToConfig = (urlString?: string): AppConfig => {
    if (!urlString) {
        return defaultAppConfig;
    }
    const {query} = url.parse(urlString, true);
    return {
        DEBUG: query.DEBUG ? Boolean(query.DEBUG) : defaultAppConfig.DEBUG,
        debugOutputDir: query.debugOutputDir ? String(query.debugOutputDir) : defaultAppConfig.debugOutputDir,
        autoFocus: query.autoFocus ? Boolean(query.autoFocus) : defaultAppConfig.autoFocus,
        autoSave: query.autoSave ? Boolean(query.autoSave) : defaultAppConfig.autoSave,
        autoSaveTimeoutMs: query.autoSaveTimeoutMs
            ? Number(query.autoSaveTimeoutMs)
            : defaultAppConfig.autoSaveTimeoutMs,
        boundRatio: query.boundRatio ? Number(query.boundRatio) : defaultAppConfig.boundRatio,
        outputDir: query.outputDir ? String(query.outputDir) : defaultAppConfig.outputDir,
        outputContentTemplate: defaultAppConfig.outputContentTemplate,
    };
};
const cliToConfig = (): AppConfig => {
    const args = minimist(process.argv.slice(2));
    return {
        ...defaultAppConfig,
        ...args,
    };
};

*/
// singleton
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    // app.on("second-instance", (event, commandLine, workingDirectory) => {
    //     appProcess.main(cliToConfig());
    // });
}
const appProcess = {
    isProcessing: false,
    abortDeferred: new AbortController(),
    async start(config: AppConfig, activeWindow: activeWin.Result) {
        if (appProcess.isProcessing) {
            await appProcess.cancel();
        }
        appProcess.isProcessing = true;
        try {
            await run({
                config,
                activeWindow,
                abortSignal: appProcess.abortDeferred.signal
            });
        } catch (error: any) {
            if (error.message !== "Cancel") {
                console.error(error);
            }
        } finally {
            appProcess.finish();
        }
    },
    finish() {
        appProcess.abortDeferred = new AbortController();
        appProcess.isProcessing = false;
    },
    async cancel() {
        appProcess.abortDeferred.abort();
        appProcess.abortDeferred = new AbortController();
        appProcess.isProcessing = false;
        await timeout(16);
    }
};

// let _appConfig: null | AppConfig = null;
// app.on("open-url", function (event, url) {
//     event.preventDefault();
//     if (!app.isReady()) {
//         _appConfig = urlToConfig(url);
//     } else {
//         const appConfig = urlToConfig(url);
//         appProcess.run(appConfig);
//     }
// });
const getUserConfigFile = (): string | undefined => {
    try {
        const homedir = app.getPath("home");
        const userConfigPathList = path.join(homedir, ".config/mumemo/mumemo.config.js");
        return fs.existsSync(userConfigPathList) ? userConfigPathList : undefined;
    } catch {
        return undefined;
    }
};
const onReady = async (): Promise<any> => {
    // if (_appConfig) {
    //     appProcess.run(_appConfig);
    // } else {
    //     const args = minimist(process.argv.slice(2));
    //     if (args.startup) {
    //         appProcess.run(cliToConfig());
    //     }
    // }
    const userConfigPath = getUserConfigFile();
    // restart when config file is changed
    if (typeof userConfigPath === "string") {
        fs.watch(userConfigPath, (eventType) => {
            if (eventType === "change") {
                // TODO: unstable
                // app.relaunch();
                // app.exit();
            }
        });
    }
    // FIXME: dynamic require
    // electron-webpack does not support require out of app
    const userConfig: MumemoConfigFile = typeof userConfigPath === "string" ? eval(`require("${userConfigPath}")`) : {};
    const openDialogReturnValuePromise = (defaultDir?: string) => {
        const focusedWindow = new BrowserWindow({
            show: false,
            alwaysOnTop: true
        });
        const options: OpenDialogOptions = {
            properties: ["openDirectory", "createDirectory"],
            title: "Select a output directory",
            defaultPath: defaultDir ?? path.join(app.getPath("documents")),
            buttonLabel: "Save to here"
        };
        if (focusedWindow) {
            return dialog.showOpenDialog(focusedWindow, options);
        }
        return dialog.showOpenDialog(options);
    };
    let outputDir = store.get("output-dir") as string | undefined;
    if (!outputDir) {
        const result = await openDialogReturnValuePromise();
        if (result.canceled) {
            return onReady();
        }
        outputDir = result.filePaths[0] as string;
        store.set("output-dir", outputDir);
    }
    if (!outputDir) {
        throw new Error("outputDir is not found");
    }
    // Unregister a shortcut.
    const definedShortcutKeys: string[] = (() => {
        if (!userConfig.shortcutKey) {
            return [defaultShortcutKey];
        }
        if (Array.isArray(userConfig.shortcutKey)) {
            return userConfig.shortcutKey;
        }
        return [userConfig.shortcutKey];
    })();
    definedShortcutKeys.forEach((shortcutKey) => {
        globalShortcut.unregister(shortcutKey);
        globalShortcut.register(shortcutKey, () => {
            try {
                const activeInfo = activeWin.sync();
                if (!activeInfo) {
                    console.error(new Error("Not found active window"));
                    return;
                }
                const outputDir = store.get("output-dir") || path.join(app.getPath("documents"), "mumemo");
                if (typeof outputDir !== "string") {
                    throw new Error("output-dir is not string");
                }
                const config: AppConfig = {
                    // 1. user config
                    // 2. store.get(output-dir)
                    // 3. Default path
                    outputDir,

                    ...createUserConfig({ app, path, activeWindow: activeInfo, shortcutKey }),
                    ...(userConfig.create
                        ? userConfig.create({
                              app,
                              path,
                              activeWindow: activeInfo,
                              shortcutKey
                          })
                        : {})
                };
                appProcess.start(config, activeInfo);
            } catch (error) {
                console.log(
                    "mumemo requires the accessibility permission in “System Preferences › Security & Privacy › Privacy › Accessibility"
                );
                console.error(error);
            }
        });
    });
    // @ts-ignore
    const tray = new Tray(path.join(__static, "tray.png"));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: `Output: ${outputDir}`
        },
        {
            label: `Change output directory`,
            click: async () => {
                const result = await openDialogReturnValuePromise(outputDir);
                if (result.canceled) {
                    return;
                }
                outputDir = result.filePaths[0];
                store.set("output-dir", outputDir);
            }
        },
        {
            type: "separator"
        },
        {
            label: "Open content file",
            click: async () => {
                const activeInfo = activeWin.sync() || {};
                if (!outputDir) {
                    return;
                }
                const config: AppConfig = {
                    ...createUserConfig({ app, path }),
                    ...(userConfig.create ? userConfig.create({ app, path, activeWindow: activeInfo }) : {}),
                    outputDir
                };
                const outputContentFileName = path.join(outputDir, config.outputContentFileName);
                console.log("outputContentFileName", outputContentFileName);
                await shell.openPath(outputContentFileName);
            }
        },
        {
            type: "separator"
        },
        {
            label: "Quit",
            click: async () => {
                app.exit(0);
            }
        }
    ]);
    tray.setToolTip("Mumemo");
    tray.setContextMenu(contextMenu);
};
app.on("ready", () => {
    onReady();
});

app.on("will-quit", () => {
    // Unregister a shortcut.
    globalShortcut.unregister("CommandOrControl+Shift+X");
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});
