export const defaultOpts = {
  baudRate: 115200,
};

export const MICRO_INTER_CMD = {
  setRawRepl: 0x01,
  setNormalRepl: 0x02,
  stopCurrent: 0x03,
  softRebot: 0x04,
  passMode: 0x05,
  CtrD: 0x04,
  endCMD: '\r\n',
  endFile: '\r\nb\'\''
}

export const SIG = {
  logo: "\\__,_|_|_| |_|\\___/ \\_/\\_/",
  RawReplStr: ">>>",
  PasteModeStr: "==="
}