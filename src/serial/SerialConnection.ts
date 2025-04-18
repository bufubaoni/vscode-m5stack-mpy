import { SerialPort } from 'serialport';
import { InterByteTimeoutParser } from '@serialport/parser-inter-byte-timeout';
import { PortInfo } from '@serialport/bindings-interface';
import Crc from './Crc';
import { defaultOpts } from './types';
import { output } from '../utils/outputChannelUtil';

class SerialConnection {
  private com: string;
  public port: SerialPort;
  private isBusy: boolean = false;
  public resolve: (value: Buffer) => void;
  public reject: (value: any) => void;
  private onOpenCb: (err: unknown) => void;
  private received: Buffer;
  private dataTimeout?: NodeJS.Timeout;
  private parser: InterByteTimeoutParser;

  constructor(com: string, onOpenCb: (err: unknown) => void) {
    this.com = com;
    this.port = new SerialPort({ path: com, ...defaultOpts });
    this.parser = this.port.pipe(new InterByteTimeoutParser({ interval: 30 }));
    this.parser.on('data', (data: string) => this.onData(Buffer.from(data))); // 确保数据是 Buffer
    this.port.on('error', (err) => this.onError(err));
    this.port.on('open', (err) => this.onOpen(err));
    this.received = Buffer.from([]);
    this.resolve = () => { };
    this.reject = () => { };
    this.onOpenCb = onOpenCb;
  }

  static getCOMs(): Promise<PortInfo[]> {
    return SerialPort.list()
  }

  get busy(): boolean {
    return this.isBusy;
  }

  sendCommand(code: number, data: string): Promise<Buffer> {
    return this.sendCommandWithBuffer(Crc.createDataBuffer(code, data));
  }

  sendCommandWithBuffer(buffer: Buffer): Promise<Buffer> {
    this.received = Buffer.from([]);
    const self = this;
    return new Promise((resolve, reject) => {
      self.resolve = resolve;
      self.reject = reject;
      self.write(buffer);
    });
  }

  write(data: Buffer): void {
    try {
      this.isBusy = true;
      this.port.write(data);
      this.port.drain((err) => {
        if (err) {
          this.reject('drain error');
          output.log('drain error', err);
        }
      });
    } catch (e) {
      this.isBusy = false;
      this.reject('write error');
    }
  }

  onData(chunk: Buffer): void {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.received = Buffer.concat([this.received, data]);
    if (this.dataTimeout) clearTimeout(this.dataTimeout);
    this.dataTimeout = setTimeout(() => {
      const completeData = this.received;
      this.received = Buffer.from([]);
      this.resolve(completeData);
      this.isBusy = false;
    }, 200);
  }

  onError(err: any): void {
    output.log(`[ERROR] ${err}`);
    this.isBusy = false;
  }

  onOpen(err: unknown): void {
    if (!err) {
      output.log(`Opened connection on ${this.com}`);
      this.onOpenCb(err);
    }
  }

  close(cb: any) {
    this.port.close(cb);
    this.isBusy = false;
  }
}

export default SerialConnection;
