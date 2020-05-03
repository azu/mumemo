import { app } from "electron";

module.epxorts = {
    DEBUG: true,
    outputDir: app.getPath("downloads"),
    debugOutputDir: app.getPath("downloads"),
    boundRatio: 0.2,
};
