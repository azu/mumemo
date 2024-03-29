# mumemo

![mumemo](docs/resources/mumemo.jpg)

Mumemo is screenshot-driven note application.
Mumemo is also No-UI(User Interaction) note application.

## Features

- Screenshot **focus area** automatically and add note about it
- Support No-UI(User Interaction) mode

mumemo decide **focus area** according to followings:

- Cursor point
- Highlight ares like sections in the screenshot
    - mumemo use [OpenCV.js](https://docs.opencv.org/3.4/d5/d10/tutorial_js_root.html) 

Example of **focus area** workflow(`DEBUG:true`):

| Input  |  Step 2    |  Step 3  |  Step 4    | Output |
| ---- | ---- | ---- | ---- | ---- |
| ![input image](docs/resources/_debug-step1.png) | ![step2](docs/resources/_debug-step2.png)     | ![step3](docs/resources/_debug-step3.png)     | ![step4](docs/resources/_debug-step4.png)     | ![output image](docs/resources/_debug-step5.png) | 

> Screenshot from <https://git-scm.com/book/ja/v2>

## Supports

- [x] macOS
- [ ] [cross platform support #6](https://github.com/azu/mumemo/issues/6)

## Installation

> https://github.com/azu/mumemo/releases/latest

1. Download a binary from [the latest releases](https://github.com/azu/mumemo/releases/latest)
2. Install app

:warning: This app is not signed. So, OS show warning about it.

Additional installation steps on macOS:

1. Select `mumemo.app`
2. Open context menu and Click "Open"

:warning: require permission on macOS.
Open the app, and you need to add permission for mumemo.app

- **Accessibility**
    - use accessibility permission to get `activeWindow` object
    - `activeWindow` includes active app info like bundle.id, url, title.
- **Screen Recording**
    - use Screen Recording permission to get screenshot

## Usage

### 1. Setup 

1. Setup **output directory**

This app writes Markdown note(`README.md`) and screenshots into the output directory.

### 2. Start to note via Global Shortcut

:memo: You need to allow mumemo.app to access "Accessibility" and "Screen recording" on macOS's Privacy options
This app requires the permission for get active window information.

1. Press <kbd>CommandOrControl+Shift+X</kbd> (It can be customized by `mumemo.config.js`)
2. Capture **focus area** and show note window

3. Note your memo into the window
4. Save it

The app writes the input memo and captured image into **output directory**.

## Configuration

You can customize key config and others by `~/.config/mumemo/mumemo.config.js`.

- `shortcutKey`: shortcut key for launch
    - See also the key syntax: <https://www.electronjs.org/docs/api/accelerator>
- `create()`: This function create config and return it 
    - This function is called when shortcut key was pressed

```js
module.exports.shortcutKey = "CommandOrControl+Shift+M"
/**
 * app is electron app
 * path is Node's path module
 * activeWindow is https://github.com/sindresorhus/active-win result
 **/
module.exports.create = ({ app, path, activeWindow }) => {
    return {
        autoFocus: true,
        autoSave: true,
        autoSaveTimeoutMs: 5 * 1000,
        // DEBUG,
        DEBUG: false
    };
}
```

`UserConfig` inteface is following.

```ts
{
  /**
   * Enable debug mode
   * Default: false
   */
  DEBUG: boolean;
  /**
   * Output dir path
   * if set the path, use the path instead of stored path
   * Default: use stored path
   */
  outputDir?: string;
  /**
   * Output content file name
   * Default: README.md
   */
  outputContentFileName: string;
  /**
   * Output image directory prefix
   * If you want to put images to same dir with README.md, set "."
   * Default: img/
   */
  outputImageDirPrefix: string;
  /**
   * format input by this function and append the result
   * Default: for markdown
   */
  outputContentTemplate: (args: OutputContentTemplateArgs) => string;
  /**
   * Auto focus when open input window
   * Default: true
   */
  autoFocus: boolean;
  /**
   * Save content automatically without no focus the input window after autoSaveTimeoutMs
   * Default: true
   */
  autoSave: boolean;
  /**
   * config for autosave
   * Default: 30 * 1000
   */
  autoSaveTimeoutMs: number;
  /**
   * if quoteFrom is clipboard, quote text from clipboard
   * if quoteFrom is selectedText, quote text from selected text
   * Default: "selectedText"
   */
  quoteFrom: "clipboard" | "selectedText";
  /**
   * Send key stroke when ready to input window
   * Note: macOS only
   */
  sendKeyStrokeWhenReadyInputWindow?: {
    key: string;
    shift?: boolean;
    control?: boolean;
    option?: boolean;
    command?: boolean;
  };
  /**
   * bound ratio for screenshot
   * Increase actual focus area using this ratio.
   * Default: 1.2
   */
  screenshotBoundRatio: number;
  /**
   * Max search count for related content that is included into screenshot result
   * The higher the number, screenshot size is large.
   * Default: 5
   */
  screenshotSearchRectangleMaxCount: number;

  /**
   * if the rectangle count is over, mumemo give up to create focus image.
   * Just use screenshot image instead of focus image
   * Default: 80
   */
  screenshotGiveUpRectangleMaxCount: number;

  /**
   * if the factor value is defined, mumemo resize screenshot image with the factor.
   * Retina display's the factor value is 2.
   * display size * factor value is the result of screenshot image size.
   * if you want to resize the screeenshot image size, set `1` to `screenshotResizeFactor`
   * Default: displayFactor's value
   */
  screenshotResizeFactor?: number;
}
```

For more details, see [src/main/Config.ts](src/main/Config.ts)

## Recipes

### No-UI notes

`mumemo` works with No-UI(User Integration).

The combination of `autoFocus: false` and `autoSave: true` that allow to save without user interaction.

1. Press shortcut
2. Preview the result in popup window
    - You can add a note if you want
3. Close the window and save it after 3 seconds

`~/.config/mumemo/mumemo.config.js`:

```js
module.exports.shortcutKey = "CommandOrControl+Shift+X"
module.exports.create = ({ app, path }) => {
    return {
        autoFocus: false,
        autoSave: true,
        autoSaveTimeoutMs: 3 * 1000,
    };
}
```

### Change behavior by each app

You can change config by each app.

```ts
module.exports.create = ({ app, path, activeWindow }) => {
    // Note: macOS's activeWindow has owner.bundleId
    const isKindle = activeWindow?.owner?.bundleId?.includes("Kindle")
    return {
        autoFocus: true,
        autoSave: true,
        quoteFrom: isKindle ? "clipboard" : "selectedText"
    };
}
```

### Resize screenshot size by screen size

When you use 4K display, resize screenshot size to 1/2.

```ts
module.exports.create = ({ app, path, activeWindow }) => {
    return {
        // If you use 4K display, resize 1/2 screenshot size
        // 4K display will be 2 by default.
        // so screenshotResizeFactor is `1` that equal to 1/2 size.
        screenshotResizeFactor: activeWindow?.bounds?.width >= 2560 ? 1 : undefined
    };
}
```

## Motivation

I've liked to write note and capture the screenshot during reading a book.

This behavior take two steps.

1. Capture the screenshot
2. Go to another note application like [OneNote](https://www.onenote.com/) and paste it
3. Add a note about the screenshot(page)
4. Back to viewer application

`mumemo` reduce the steps.

1. Press key -> Capture the screenshot and save it 
2. [Options] Add a note if I want


## Debug

mumemo output debug log using [electron-log](https://www.npmjs.com/package/electron-log)

    on Linux: ~/.config/{app name}/logs/{process type}.log
    on macOS: ~/Library/Logs/{app name}/{process type}.log
    on Windows: %USERPROFILE%\AppData\Roaming\{app name}\logs\{process type}.log

Tail logging

```
$ tail -F ~/Library/Logs/mumemo/main.log
```

## Developing

Debug

    yarn install
    yarn dev

Build

    yarn dist

Release

    npm version {patch,minor,major}
    git push --tags

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## License

MIT
