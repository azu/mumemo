import meow from "meow";
import ndjson from "ndjson";
import * as fs from "fs";
import * as path from "path";

type Item = {
    title: string;
    imgKey: string;
    body: string;
};

const convertNDJSONtoMemo = (jsonFile: string): Promise<{ images: string[]; output: string }> => {
    return new Promise((resolve, reject) => {
        let output = "";
        const baseDir = path.dirname(jsonFile);
        const images: string[] = [];
        fs.createReadStream(jsonFile)
            .pipe(ndjson.parse())
            .on("data", function (item: Item) {
                images.push(path.join(baseDir, `${item.imgKey}.png`));
                output += `![](img/${item.imgKey}.png)
${item.body.trim().length > 0 ? "> " + item.body.split("\n").join("\n> ") + "\n" : ""}
`;
            })
            .on("end", () => {
                resolve({
                    images,
                    output
                });
            })
            .on("error", (error) => {
                reject(error);
            });
    });
};

export const cli = meow(
    `
    Usage
      $ node create-memo [file]
 
    Options
      --output    [Path:String] output directory path [required]

    Examples
      $ node --require ts-node/register create-memo.ts path/to/memo.json --output path/to/memo
`,
    {
        flags: {
            output: {
                type: "string"
            }
        },
        autoHelp: true,
        autoVersion: true
    }
);

export const run = async (
    input = cli.input,
    flags = cli.flags
): Promise<{ exitStatus: number; stdout: string | null; stderr: Error | null }> => {
    const outDir = flags.output;
    if (!outDir) {
        throw new Error("Require --output");
    }
    fs.mkdirSync(outDir, {
        recursive: true
    });
    fs.mkdirSync(path.join(outDir, "img"), {
        recursive: true
    });
    const { output, images } = await convertNDJSONtoMemo(input[0]);
    // write readme
    fs.writeFileSync(path.join(outDir, "README.md"), output, "utf-8");
    // copy images
    images.forEach((imagePath) => {
        const fileName = path.basename(imagePath);
        if (fs.existsSync(imagePath)) {
            fs.renameSync(imagePath, path.join(outDir, "img", fileName));
        } else {
            console.log("skip copy img" + imagePath);
        }
    });
    return {
        stdout: null,
        stderr: null,
        exitStatus: 0
    };
};
if (!module.parent) {
    (async () => {
        run().then(
            ({ exitStatus, stderr, stdout }) => {
                if (stdout) {
                    console.log(stdout);
                }
                if (stderr) {
                    console.error(stderr);
                }
                process.exit(exitStatus);
            },
            (error) => {
                console.error(error);
                process.exit(1);
            }
        );
    })();
}
