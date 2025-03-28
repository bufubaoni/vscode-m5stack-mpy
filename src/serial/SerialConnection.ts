import SerialPort from 'serialport';
import Crc from './Crc';
import { defaultOpts } from './types';
import * as vscode from 'vscode';
import { check } from 'prettier';

const comErroMessage = 'Communication error, sorry.';

class SerialConnection {
  private com: string;
  public port: SerialPort;
  private isBusy: boolean = false;
  public resolve: (value: Buffer) => void;
  public reject: (value: any) => void;
  private onOpenCb: (err: unknown) => void;
  private received: Buffer;
  constructor(com: string, onOpenCb: (err: unknown) => void) {
    this.com = com;
    this.port = new SerialPort(com, defaultOpts);
    this.port.on('error', this.onError);
    this.port.on('open', this.onOpen.bind(this));
    this.port.on('data', this.onData.bind(this));
    this.received = Buffer.from([]);
    this.resolve = (chuck) => { console.log(chuck) };
    this.reject = () => { vscode.window.showInformationMessage("reject") };
    this.onOpenCb = onOpenCb;
  }

  static getCOMs(): Promise<SerialPort.PortInfo[]> {
    return new Promise((resolve) => {
      SerialPort.list().then(
        (ports: SerialPort.PortInfo[]) => resolve(ports),
        (err: any) => resolve([])
      );
    });
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
      console.log('sending bytes', buffer);
      self.resolve = resolve;
      self.reject = reject;
      self.write(Crc.coverCrc(buffer));
    });
  }

  write(data: Buffer): void {
    try {
      this.isBusy = true;
      this.port.write(data);
      this.port.drain((err) => {
        if (err) {
          this.reject('drain error');
          console.log('drain error', err);
        }
      });
    } catch (e) {
      this.isBusy = false;
      this.reject('write error');
    }
  }

  onData(chunk: Buffer): void {
    this.isBusy = true;
    this.received = Buffer.concat([this.received, chunk]);
    this.resolve(this.received);
    this.isBusy = false;
  }

  onError(err: any): void {
    console.log(err);
    this.isBusy = false;
  }

  onOpen(err: unknown): void {
    if (!err) {
      console.log(`opened connection on ${this.com}`);
      this.onOpenCb(err);
    }
  }

  close(cb: any) {
    this.port.close(cb);
    this.isBusy = false;
  }
}

export default SerialConnection;
