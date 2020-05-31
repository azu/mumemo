import { app, dialog, globalShortcut, Menu, Tray, shell } from "electron";
import { Deferred } from "./Deferred";
import { timeout } from "./timeout";
import activeWin from "active-win";
import { createUserConfig, defaultShortcutKey } from "./Config";
import path from "path";
import { AppConfig, run } from "./app";
import * as fs from "fs";
import Store from "electron-store";

const store = new Store();
const log = require("electron-log");
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
    abortDeferred: new Deferred(),
    async start(config: AppConfig, activeWindow: activeWin.Result) {
        if (appProcess.isProcessing) {
            await appProcess.cancel();
        }
        appProcess.isProcessing = true;
        try {
            await run({
                config,
                activeWindow,
                abortablePromise: appProcess.abortDeferred.promise,
            });
        } catch (error) {
            if (error.message !== "Cancel") {
                console.error(error);
            }
        } finally {
            appProcess.finish();
        }
    },
    finish() {
        appProcess.abortDeferred.resolve();
        appProcess.abortDeferred = new Deferred<any>();
        appProcess.isProcessing = false;
    },
    async cancel() {
        appProcess.abortDeferred.reject(new Error("Cancel"));
        appProcess.abortDeferred = new Deferred<any>();
        appProcess.isProcessing = false;
        await timeout(16);
    },
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
        const userConfigPathList = path.join(homedir, ".config/numemo/numemo.config.js");
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
    const userConfig = typeof userConfigPath === "string" ? eval(`require("${userConfigPath}")`) : {};
    const openDialogReturnValuePromise = () => {
        return dialog.showOpenDialog({
            properties: ["openDirectory", "createDirectory"],
            title: "Select a output directory",
            defaultPath: path.join(app.getPath("documents")),
            buttonLabel: "Save to here",
        });
    };
    let outputDir = store.get("output-dir");
    if (!outputDir) {
        const result = await openDialogReturnValuePromise();
        if (result.canceled) {
            return onReady();
        }
        outputDir = result.filePaths[0];
        store.set("output-dir", outputDir);
    }
    // Unregister a shortcut.
    globalShortcut.unregister(userConfig.shortcutKey ?? defaultShortcutKey);
    globalShortcut.register(userConfig.shortcutKey ?? defaultShortcutKey, () => {
        const activeInfo = activeWin.sync();
        if (!activeInfo) {
            console.error(new Error("Not found active window"));
            return;
        }
        const outputDir = store.get("output-dir") || path.join(app.getPath("documents"), "mumemo");
        const config: AppConfig = {
            ...createUserConfig({ app, path, activeWindow: activeInfo }),
            ...(userConfig.create ? userConfig.create({ app, path, activeWindow: activeInfo }) : {}),
            outputDir,
        };
        appProcess.start(config, activeInfo);
    });
    // @ts-ignore
    const tray = new Tray(path.join(__static, "tray.png"));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: `Output: ${outputDir}`,
        },
        {
            label: `Change output directory`,
            click: async () => {
                const result = await openDialogReturnValuePromise();
                if (result.canceled) {
                    return;
                }
                outputDir = result.filePaths[0];
                store.set("output-dir", outputDir);
            },
        },
        {
            type: "separator",
        },
        {
            label: "Open content file",
            click: async () => {
                const config: AppConfig = {
                    ...createUserConfig({ app, path }),
                    ...(userConfig.create ? userConfig.create({ app, path }) : {}),
                    outputDir,
                };
                const outputContentFileName = path.join(outputDir, config.outputContentFileName);
                shell.openItem(outputContentFileName);
            },
        },
        {
            type: "separator",
        },
        {
            label: "Quit",
            click: async () => {
                app.exit(0);
            },
        },
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
