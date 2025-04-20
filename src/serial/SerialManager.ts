import SerialConnection from './SerialConnection';
import { MICRO_INTER_CMD, SIG } from './types';
import vscode from 'vscode';
import { output } from '../utils/outputChannelUtil';

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

  async initCmd(com: string) {
    try {
      const timeout = 3000; // 3 seconds timeout
      output.log(`Send Hex: ${Buffer.from(MICRO_INTER_CMD.endCMD).toString('hex')}`);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Command timeout after ${timeout} ms`)), timeout);
      });

      try {
        await Promise.race([
          this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD)),
          timeoutPromise
        ]);
      } catch (err) {
        output.log(`[WARN] Timeout Send Hex: ${Buffer.from([MICRO_INTER_CMD.stopCurrent]).toString('hex')}`);
        this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.stopCurrent]));
      }
      const res = await this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD));
      output.log(res.toString());
      if (res.toString() === '') {
        output.log('Raw REPL mode is now active.');
        output.log(`Send Hex: ${Buffer.from([MICRO_INTER_CMD.stopCurrent]).toString('hex')}`);
        await this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.stopCurrent]));
      } else if (res.toString().includes(SIG.logo)) {
        output.log('Raw REPL mode from log.');
        output.log(`Send Hex: ${Buffer.from([MICRO_INTER_CMD.stopCurrent]).toString('hex')}`);
        await this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.stopCurrent]));
      } else if (res.toString().includes(SIG.RawReplStr)) {
        output.log('Enter Raw REPL mode directly.');
      } else if (res.toString().includes(SIG.PasteModeStr)) {
        output.log('Enter Raw REPL mode from paste mode.');
        output.log(`Send Hex: ${Buffer.from([MICRO_INTER_CMD.stopCurrent]).toString('hex')}`);
        const res3 = await this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.stopCurrent]));
        output.log(`resp: ${res3.toString()}`);
      }
      else {
        output.log('[WARNING] Failed to enter Raw REPL mode.');
      }
      output.log("init successful.");
    } catch (e) {
      throw new Error("init execution failed");
    }
  }

  async exec(com: string, code: string): Promise<Buffer> {
    return this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.softRebot.toString(16)));
  }

  async listDir(com: string, dirname: string): Promise<Buffer> {
    try {
      const cmd = `import os; files = os.listdir('${dirname}'); print(','.join(files));`;
      output.log(">>>" + cmd)
      const res = await this.arunCmd(com, cmd);
      output.log(res.toString())
      return res;
    } catch (err) {
      const error = err as Error;
      output.log('[ERROR] ' + error.toString());
      throw error;
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

  async readFile(
    com: string,
    filename: string,
    chunkSize: number = 512
  ): Promise<Buffer> {
    let offset = 0;
    const chunks: Buffer[] = [];

    try {
      while (true) {
        const cmd = `f=open('${filename}','rb');f.seek(${offset});chunk=f.read(${chunkSize});f.close();print(chunk.hex())`;
        output.log(`>>> ${cmd}`);
        const rawResponse = (await this.arunCmd(com, cmd)).toString();
        let [sizeStr, hexData] = rawResponse.split(MICRO_INTER_CMD.endCMD, 2);
        hexData = rawResponse.replace(`${sizeStr}${MICRO_INTER_CMD.endCMD}`, "");
        const res = hexData.toString()
        output.log(`${res}`);
        if (res == "b''") {
          break;
        }

        chunks.push(Buffer.from(res, 'hex'));
        offset += chunkSize;
      }

      return Buffer.concat(chunks);
    } catch (err) {
      output.log('[ERROR] ', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async download(
    com: string,
    filename: string,
    content: string | Buffer,
    flag: number,
    isBinary?: boolean
  ): Promise<Buffer> {
    const data = isBinary ? (content as Buffer) : Buffer.from(content as string);
    const mode = flag === 0x01 ? 'wb' : 'ab';

    try {
      // 单次写入全部数据
      const cmd = `f=open("${filename}","${mode}"); f.write(${JSON.stringify(data.toString('binary'))}); f.close()`;
      const result = await this.arunCmd(com, cmd);
      output.log(`return: ${result.toString()}`);
      return Buffer.from('done');
    } catch (err) {
      const error = err as Error;
      output.log(`[ERROR] Failed to save ${filename}: ${error.message}`);
      return Promise.reject(Buffer.from(error.message));
    }
  }

  async bulkDownload(
    com: string,
    filename: string,
    content: string | Buffer,
    isBinary: boolean,
    progressCb: (chunkIndex: number) => void,
    chunkSize: number = 512
  ): Promise<Buffer> {
    const data = isBinary ? (content as Buffer) : Buffer.from(content as string);
    const totalChunks = Math.ceil(data.length / chunkSize);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = data.slice(i * chunkSize, (i + 1) * chunkSize);
        const result = await this.download(
          com,
          filename,
          chunk,
          i === 0 ? 0x01 : 0x00,
          isBinary
        );

        if (result.toString().indexOf('done') < 0) {
          throw new Error(`Chunk ${i} failed: ${result.toString()}`);
        }

        progressCb(i + 1);
      }

      return Buffer.from('done');
    } catch (err) {
      const error = err as Error;
      output.log(`[ERROR] Bulk download failed at chunk: ${error.message}`);
      return Promise.reject(Buffer.from(error.message));
    }
  }

  async removeFile(com: string, filename: string) {
    const cmd = `import os; os.remove('${filename}');`;
    return this.arunCmd(com, cmd);
  }

  async run(com: string, data: string) {
    const runcl = "import gc; gc.collect()";
    await this.m5[com].sendCommandWithBuffer(Buffer.from(runcl));
    const res1 = await this.m5[com].sendCommandWithBuffer(Buffer.from(MICRO_INTER_CMD.endCMD));
    output.log(`Collect gc: ${res1}`)
    output.log("Set past model init.");
    const res = await this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.passMode]));
    output.log("Set past model successful: " + res.toString())
    const lines = data.split('\n');
    output.log(`[${com}] ready to send ${lines.length} lines`);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.trim() === '') continue;
      try {
        await this.m5[com].sendCommandWithBuffer(Buffer.from(line + MICRO_INTER_CMD.endCMD));
        output.log(`===${line}`)
      } catch (lineError) {
        output.log(`[${com}] line ${index + 1} failed: ${lineError}`);
        throw new Error(`line ${index + 1} failed: ${lineError}`);
      }
    }
    return this.m5[com].sendCommandWithBuffer(Buffer.from([MICRO_INTER_CMD.CtrD]));
  }

  disconnect(com: string) {
    if (this.m5[com]) {
      this.m5[com].close((error?: Error | null) => {
        if (error) {
          output.log('Error while disconecting', error);
        }
        delete this.m5[com];
      });
    }
  }
}

export default new SerialManager();
