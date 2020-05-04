# mumemo

Mumemo is Screenshot-behavior note application.
Mumemo is also No-UI(User Interaction) note application.

## Features

- Screenshot **focus area** automatically and add note about it
- Support No-UI(User Interaction) mode

## Motivation

I've liked to write note and capture the screenshot during reading a book.

This behavior.take two steps.

1. Capture the screenshot
2. Go to another note application like [OneNote](https://www.onenote.com/) and paste it
3. Add a note about the screenshot(page)
4. Back to viewer application

`mumemo` reduce the steps.

1. Press key -> Capture the screenshot and save it 
2. [Options] Add a note if I want

## Installation

    yarn install
    yarn dist

## Usage

### First Time setup

1. Setup **output directory**

This app writes Markdown note(`README.md`) and screenshots into the output directory.

### Start to note via Global Shortcut

1. Press <kdd>CommandOrControl+Shift+X</kdd> (It can be customized by `mumemo.config.js`)
2. Capture **focus area** and show note window
3. Note your memo into the window
4. Save it

The app writes the input memo and captured image into **output directory**.

## Configuration

You can customize key config and others by `~/.config/mumemo/mumemo.config.js`

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
export type UserConfig = {
    /**
     * Enable debug mode
     * Default: false
     */
    DEBUG: boolean;
    /**
     * Output file name
     * Default: README.md
     */
    outputFileName: string;
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
     * bound ratio for screenshot
     * Increase actual focus area using this ratio.
     * Default: 1.2
     */
    screenshotBoundRatio: number;
};
```

For more details, see [src/main/Config.ts](src/main/Config.ts)

## Receipts

### No-UI notes

`mumemo` works with No-UI(User Integration).

The combination of `autoFocus: false` and `autoSave: true` that allow to save without user interaction.

1. Press shortcut
2. Preview the result in popup window
    - You can add a note if you want
3. Close the window and save it after 3 seconds

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
