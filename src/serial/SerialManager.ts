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

  rawMode(com: string): Promise<Buffer> {
    return this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.setRawRepl]));
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
      const res = this.arunCmd(com, cmd)
      console.log("end exec cmd result: " + res.toString())
      return res;
    } catch (e) {
      console.error('Error occurred:', e.toString());
      throw e;
    }
  }

  async arunCmd(com: string, cmd: string): Promise<Buffer> {
    await this.m5[com].sendCommandWithBuffer(Buffer.from(cmd));
    const resp = await this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD))
    const lines = resp.toString().split('\r\n');

    // 2. 移除首行和末行（如果存在）
    if (lines.length > 0) lines.shift(); // 移除第一行
    if (lines.length > 0) lines.pop();   // 移除最后一行

    // 3. 将剩余行重新组合为 Buffer
    const result = lines.join('\r\n');
    return Buffer.from(result); // 明确转换为 Buffer
  }

  async aendCmd(com: string): Promise<Buffer> {
    return this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD));
  }

  isBusy(com: string) {
    return this.m5[com].busy;
  }

  async readFile(com: string, filename: string): Promise<Buffer> {
    try {
      const cmd = `print(open('${filename}', 'r').read())`;
      const res = this.arunCmd(com, cmd)
      return res;
    } catch (e) {
      console.error('Error occurred:', e.toString());
      throw e;
    }
  }

  download(
    com: string,
    filename: string,
    content: string | Buffer,
    flag: number,
    isBinary?: boolean
  ): Promise<Buffer> {
    const data = isBinary ? (content as Buffer) : Buffer.from(content);
    const buffer = Buffer.concat([
      Buffer.from([COMMAND_CODES.downloadFile]),
      Buffer.from(filename),
      Buffer.from([0x00]),
      Buffer.from([flag]),
      data,
    ]);
    return this.m5[com].sendCommandWithBuffer(buffer);
  }

  async bulkDownload(
    com: string,
    filename: string,
    content: string | Buffer,
    isBinary: boolean,
    progressCb: (chunkIndex: number) => void
  ): Promise<Buffer> {
    let dataChunks = [];

    if (content.length > MAX_CHUNK_LENGTH) {
      let part = Math.ceil(content.length / MAX_CHUNK_LENGTH);
      for (let i = 0; i < part; i++) {
        dataChunks[i] = content.slice(i * MAX_CHUNK_LENGTH, MAX_CHUNK_LENGTH * (i + 1));
      }
    }

    if (!dataChunks.length) {
      return this.download(com, filename, content, 0x01); // overwrite
    } else {
      for (let i = 0; i < dataChunks.length; i++) {
        if (i === 0) {
          const result = await this.download(com, filename, dataChunks[i], 0x01, isBinary); // overwrite
          progressCb(i + 1);
          if (result.toString().indexOf('done') < 0) {
            return Promise.reject(
              Buffer.from(`An error occurred while saving ${filename}: ${result.toString()}`)
            );
          }
          continue;
        }
        const result = await this.download(com, filename, dataChunks[i], 0x00, isBinary); // append
        if (result.toString().indexOf('done') < 0) {
          return Promise.reject(
            Buffer.from(`An error occurred while saving ${filename}: ${result.toString()}`)
          );
        }
        progressCb(i + 1);
      }
    }

    return Promise.resolve(Buffer.from('done'));
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
