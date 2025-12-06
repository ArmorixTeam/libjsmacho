export class Writer {
  constructor(size) {
    this.buf = new Uint8Array(size);
    this.dv = new DataView(this.buf.buffer);
    this.offset = 0;
  }
  setU8(off, v) {
    this.dv.setUint8(off, v);
  }
  setU32(off, v) {
    this.dv.setUint32(off, v, true);
  }
  setU64(off, v) {
    const low = Number(BigInt(v) & 0xffffffffn);
    const high = Number((BigInt(v) >> 32n) & 0xffffffffn);
    this.setU32(off, low);
    this.setU32(off + 4, high);
  }
  writeBytes(off, bytes) {
    this.buf.set(bytes, off);
  }
  toArrayBuffer() {
    return this.buf.buffer.slice(this.buf.byteOffset, this.buf.byteOffset + this.buf.byteLength);
  }
}
