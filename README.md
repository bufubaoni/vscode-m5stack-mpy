# **vscode-m5stack-mpy-uiflow2**


# vscode-m5stack-mpy-uiflow2

A extension for M5Stack Micropython system.

## Features

- Write/Read files in M5Stack Device

## Quick Start

- Install vscode-m5stack-mpy-uiflow2.
- Connection M5Stack Device with USB cable.

![screenshot](./resources/quick-start-v2-01.jpeg)

- Click "Add M5Stack with microPython" and select the correct serial port of M5Stack status bar.

![screenshot](./resources/image_2.png)

![screenshot](./resources/image_3.png)

- Open M5Stack file tree. If Device resets, please click the refresh button to reopen the file tree.
![screenshot](./resources/image_4.png)

- Editor a file.

![screenshot](./resources/image_5.png)
- Save file. You can press `ctrl + s` or click `File->Save` to save file.

- Run code a file.

![screenshot](./resources/image_6.png)
- Click the run icon to run the file (the cursor must be on the file that will be run).

## TBD
- Auto Completion of Units and Modules.
- Display tips when hover on it.
- Syntax-highlighting
- Auto Completion
- Debugging

## Contributions

To verify changes of this plugin you build the plugin with

```
git clean -fdX
yarn cache clean
yarn
```

Then you start vscode with this directory as argument like this

```
code ./
```

Then you hit F5 and verify that it works.
See more on https://code.visualstudio.com/api

