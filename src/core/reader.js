/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

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
