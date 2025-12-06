export class Reader {
  constructor(buf, le = true) {
    this.buf = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    this.dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    this.le = le;
  }
  u8(off) {
    return this.dv.getUint8(off);
  }
  u16(off) {
    return this.dv.getUint16(off, this.le);
  }
  u32(off) {
    return this.dv.getUint32(off, this.le);
  }
  u64(off) {
    const low = this.u32(off);
    const high = this.u32(off + 4);
    return BigInt(high) << 32n | BigInt(low);
  }
  bytes(off, len) {
    return new Uint8Array(this.buf.buffer, this.buf.byteOffset + off, len);
  }
  slice(off, len) {
    return this.buf.slice(off, off + len);
  }
  length() {
    return this.buf.length;
  }
}
