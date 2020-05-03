import { app, globalShortcut } from "electron";
import * as url from "url";
import { AppConfig, defaultAppConfig, run } from "./app";
import minimist from "minimist";
import { Deferred } from "./Deferred";
import { timeout } from "./timeout";

const log = require("electron-log");
Object.assign(console, log.functions);
// mumemo://
app.setAsDefaultProtocolClient("mumemo");

const urlToConfig = (urlString?: string): AppConfig => {
    if (!urlString) {
        return defaultAppConfig;
    }
    const { query } = url.parse(urlString, true);
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

// singleton
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on("second-instance", (event, commandLine, workingDirectory) => {
        appProcess.main(cliToConfig());
    });
}
const appProcess = {
    isProcessing: false,
    abortDeferred: new Deferred(),
    run(config: AppConfig) {
        appProcess.main(config);
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
    async main(config: AppConfig) {
        if (appProcess.isProcessing) {
            await appProcess.cancel();
        }
        appProcess.isProcessing = true;
        try {
            await run(config, appProcess.abortDeferred.promise);
        } catch (error) {
            if (error.message !== "Cancel") {
                console.error(error);
            }
        } finally {
            appProcess.finish();
        }
    },
};

let _appConfig: null | AppConfig = null;
app.on("open-url", function (event, url) {
    event.preventDefault();
    if (!app.isReady()) {
        _appConfig = urlToConfig(url);
    } else {
        const appConfig = urlToConfig(url);
        appProcess.run(appConfig);
    }
});

app.on("ready", () => {
    if (_appConfig) {
        appProcess.run(_appConfig);
    } else {
        const args = minimist(process.argv.slice(2));
        if (args.startup) {
            appProcess.run(cliToConfig());
        }
    }
    globalShortcut.register("CommandOrControl+Shift+X", () => {
        appProcess.run(cliToConfig());
    });
});

app.on("will-quit", () => {
    // Unregister a shortcut.
    globalShortcut.unregister("CommandOrControl+Shift+X");
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});
