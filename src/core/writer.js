/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

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
