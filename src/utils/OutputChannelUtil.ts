import * as vscode from 'vscode';

class OutputChannelSingleton {
    private static instance: vscode.OutputChannel;
    private constructor() { }

    public static getInstance(): vscode.OutputChannel {
        if (!OutputChannelSingleton.instance) {
            OutputChannelSingleton.instance = vscode.window.createOutputChannel('M5Stack');
        }
        return OutputChannelSingleton.instance;
    }

    public static log(message: string, data?: any): void {
        const output = OutputChannelSingleton.getInstance();
        const timestamp = new Date().toISOString();
        output.appendLine(`[${timestamp}] ${message}`);
        if (data) {
            output.appendLine(JSON.stringify(data, null, 2));
        }
    }

    public static show(preserveFocus?: boolean): void {
        OutputChannelSingleton.getInstance().show(preserveFocus);
    }

    public static dispose(): void {
        if (OutputChannelSingleton.instance) {
            OutputChannelSingleton.instance.dispose();
        }
    }
}

export const output = {
    log: OutputChannelSingleton.log,
    show: OutputChannelSingleton.show,
    dispose: OutputChannelSingleton.dispose
};