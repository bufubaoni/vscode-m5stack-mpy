import { Console } from 'console';
import SerialConnection from './SerialConnection';
import { COMMAND_CODES, MICRO_INTER_CMD, SIG } from './types';
import vscode from 'vscode';

type Connections = {
  [key: string]: SerialConnection;
};

export const MAX_CHUNK_LENGTH = 2 ** 8; // 256 bytes
class SerialManager {
  private m5: Connections;

  constructor() {
    this.m5 = {};
  }

  connect(com: string, openedCb: (err: unknown) => void) {
    this.m5[com] = new SerialConnection(com, openedCb);
  }

  async ainitCmd(com: string) {
    try {
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.endCMD:start " + com.toString());
      const res = await this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD));
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.endCMD:end");
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.stopCurrent:start" + res.toString());
      console.log(res.toString());
      if (res.toString() === '') {
        vscode.window.showInformationMessage('Raw REPL mode is now active.');
        await this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.stopCurrent]));
      } else if (res.toString().includes(SIG.logo)) {
        vscode.window.showInformationMessage('Raw REPL mode from log.');
        await this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.stopCurrent]));
      } else if (res.toString().includes(SIG.RawReplStr)) {
        vscode.window.showInformationMessage('Enter Raw REPL mode directly.');
      }
      else {
        vscode.window.showErrorMessage('Failed to enter Raw REPL mode.');
      }
      console.log("init successful.");
    } catch (e) {
      throw new Error("init execution failed");
    }
  }

  exec(com: string, code: string): Promise<Buffer> {
    return this.m5[com].sendCommand(COMMAND_CODES.exec, code);
  }

  listDir(com: string, dirname: string): Promise<Buffer> {
    this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.setRawRepl.toString(16))).then((res) => {
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.setRawRepl:start");
      console.log(res.toString());
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.setRawRepl:end");
    }).catch((e) => {
      console.log(e.toString());
    });;
    let dir = `import os; files = os.listdir('${dirname}'); print(','.join(files));`
    console.info(dir);
    this.m5[com].sendCommandWithBuffer(Buffer.from(dir)).then((res) => {
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.dir:start");
      console.log(res.toString());
      console.log("sendCommandWithBuffer:MICRO_INTER_CMD.dir:end");
    }).catch((e) => {
      console.log(e.toString());
    });;
    this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD.toString(16)));
    return this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD));
  }

  async alistDir(com: string, dirname: string): Promise<Buffer> {
    try {
      const cmd = `import os; files = os.listdir('${dirname}'); print(','.join(files));`;
      const res = await this.arunCmd(com, cmd);
      console.log("end exec cmd result: " + res.toString())
      return res;
    } catch (e) {
      console.error('Error occurred:', e.toString());
      throw e;
    }
  }

  async arunCmd(com: string, cmd: string): Promise<Buffer> {
    await this.m5[com].sendCommandWithBuffer(Buffer.from(cmd));
    const resp2 = await this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD))
    const lines = resp2.toString().split(MICRO_INTER_CMD.endCMD);

    if (lines.length > 0) lines.shift();
    if (lines.length > 0) lines.pop();

    const result = lines.join(MICRO_INTER_CMD.endCMD);
    return Buffer.from(result);
  }

  isBusy(com: string) {
    return this.m5[com].busy;
  }

  async readFile(com: string, filename: string): Promise<Buffer> {
    try {
      const cmd = `f = open('${filename}', 'r'); print(f.read()); f.close();`;
      const res = this.arunCmd(com, cmd)
      return res;
    } catch (e) {
      console.error('Error occurred:', e.toString());
      throw e;
    }
  }

  async download(
    com: string,
    filename: string,
    content: string | Buffer,
    flag: number,
    isBinary?: boolean
  ): Promise<Buffer> {
    const data = isBinary ? (content as Buffer) : Buffer.from(content);
    const mode = flag === 0x01 ? 'wb' : 'ab'; // 根据标志决定写入模式

    try {
      // 单次写入全部数据
      const cmd = `f=open("${filename}","${mode}"); f.write(${JSON.stringify(data.toString('binary'))}); f.close()`;
      const result = await this.arunCmd(com, cmd);
      console.log(`return: ${result.toString()}`);
      return Buffer.from('done');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save ${filename}: ${err.message}`);
      return Promise.reject(Buffer.from(err.message));
    }
  }

  async bulkDownload(
    com: string,
    filename: string,
    content: string | Buffer,
    isBinary: boolean,
    progressCb: (chunkIndex: number) => void,
    chunkSize: number = 64
  ): Promise<Buffer> {
    const data = isBinary ? (content as Buffer) : Buffer.from(content);
    const totalChunks = Math.ceil(data.length / chunkSize);

    try {
      // 第一片用覆盖模式，后续用追加模式
      for (let i = 0; i < totalChunks; i++) {
        const chunk = data.slice(i * chunkSize, (i + 1) * chunkSize);
        const result = await this.download(
          com,
          filename,
          chunk,
          i === 0 ? 0x01 : 0x00, // 首片覆盖，后续追加
          isBinary
        );

        if (result.toString().indexOf('done') < 0) {
          throw new Error(`Chunk ${i} failed: ${result.toString()}`);
        }

        progressCb(i + 1); // 报告进度
      }

      return Buffer.from('done');
    } catch (err) {
      vscode.window.showErrorMessage(`Bulk download failed at chunk: ${err.message}`);
      return Promise.reject(Buffer.from(err.message));
    }
  }

  removeFile(com: string, filename: string) {
    return this.m5[com].sendCommand(COMMAND_CODES.removeFile, filename);
  }

  disconnect(com: string) {
    if (this.m5[com]) {
      this.m5[com].close((error?: Error | null) => {
        if (error) {
          console.log('Error while disconecting', error);
        }
        delete this.m5[com];
      });
    }
  }
}

export default new SerialManager();
