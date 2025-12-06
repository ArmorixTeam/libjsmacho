/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import { toUint8Array } from './core/buffer.js';
import { parseHeader } from './macho/header.js';
import { parseLoadCommands, findCommand, replaceCommand } from './macho/loadcommands.js';
import { parseSegments } from './macho/segments.js';
import { findCodeSignature, stripCodeSignature, buildEmptyCodeSignature } from './macho/codesig.js';
import { isFat, parseFat, extractSlice } from './macho/fat.js';
export class MachOFile {
  constructor(input) {
    this._raw = toUint8Array(input);
    this._isFat = isFat(this._raw);
    if (this._isFat) {
      this._fat = parseFat(this._raw);
      this._slices = this._fat.slices.map(s => extractSlice(this._raw, s));
      this.selectedIndex = 0;
      this._slice = this._slices[0];
      this._initSlice();
    } else {
      this._slice = this._raw;
      this._initSlice();
    }
  }
  _initSlice() {
    this.header = parseHeader(this._slice);
    this.loadCommands = parseLoadCommands(this._slice, this.header);
    this.segments = parseSegments(this._slice, this.header, this.loadCommands);
  }
  isFat() {
    return this._isFat;
  }
  getSlices() {
    return this._slices || [this._slice];
  }
  selectSlice(i) {
    if (!this._slices) throw new Error('Not a fat binary');
    if (i < 0 || i >= this._slices.length) throw new Error('Index out of range');
    this.selectedIndex = i;
    this._slice = this._slices[i];
    this._initSlice();
  }
  getLoadCommands() {
    return this.loadCommands;
  }
  getSegments() {
    return this.segments;
  }
  findCodeSignature() {
    return findCodeSignature(this.loadCommands);
  }
  stripCodeSignature() {
    return stripCodeSignature(this.loadCommands);
  }
  addPlaceholderCodeSignature() {
    this.loadCommands.push({ cmd: 0x1d, cmdsize: 8, off: 0, data: buildEmptyCodeSignature() });
  }
  setUUID(uuid) {
    const buf = new Uint8Array(16);
    const hex = uuid.replace(/-/g,'');
    for (let i = 0; i < 16; i++) buf[i] = parseInt(hex.substr(i*2,2),16);
    const uuidCmd = this.loadCommands.find(c=>c.cmd===0x1b);
    if (uuidCmd) {
      const off = uuidCmd.off + 8;
      this._writeBytesToSlice(off, buf);
    } else {
      const arr = new Uint8Array(8+16);
      const dv = new DataView(arr.buffer);
      dv.setUint32(0,0x1b,true);
      dv.setUint32(4,24,true);
      arr.set(buf,8);
      this.loadCommands.push({ cmd: 0x1b, cmdsize: 24, off: 0, data: arr });
    }
  }
  injectSegment(name, bytes) {
    const n = Math.min(16, name.length);
    const segname = new Uint8Array(16);
    for (let i=0;i<n;i++) segname[i]=name.charCodeAt(i);
    const segbuf = new Uint8Array(72 + bytes.length);
    segbuf.set(new Uint8Array(4).fill(0),0);
    const dv = new DataView(segbuf.buffer);
    dv.setUint32(0,0x19,true);
    dv.setUint32(4,segbuf.length,true);
    segbuf.set(segname,8);
    dv.setUint32(40, align(Math.floor(Math.random()*0x1000),0x1000), true);
    dv.setUint32(48, bytes.length, true);
    segbuf.set(bytes, 72);
    this.loadCommands.push({ cmd: 0x19, cmdsize: segbuf.length, off: 0, data: segbuf });
    this.segments.push({ name, vmaddr:0, vmsize:bytes.length, fileoff:0, filesize:bytes.length, nsects:0, sects:[], headerOff:0, cmdsize:segbuf.length });
  }
  patch(offset, data) {
    this._writeBytesToSlice(offset, data);
  }
  build() {
    if (this._isFat) {
      const outSlices = [];
      for (let i = 0; i < this._slices.length; i++) {
        if (i === this.selectedIndex) outSlices.push(this._buildSlice()); else outSlices.push(this._slices[i]);
      }
      const total = outSlices.reduce((a,b)=>a+b.byteLength,0) + 8 + this._fat.slices.length*20;
      const out = new Uint8Array(total);
      const dv = new DataView(out.buffer);
      dv.setUint32(0,0xcafebabe,false);
      dv.setUint32(4,this._fat.nfat,false);
      let off = 8;
      let current = 8 + this._fat.nfat*20;
      for (let i=0;i<this._fat.slices.length;i++) {
        const s = this._fat.slices[i];
        dv.setUint32(off, s.cputype, false);
        dv.setUint32(off+4, s.cpusub, false);
        dv.setUint32(off+8, current, false);
        dv.setUint32(off+12, outSlices[i].byteLength, false);
        dv.setUint32(off+16, s.align, false);
        off += 20;
        out.set(new Uint8Array(outSlices[i]), current);
        current += outSlices[i].byteLength;
      }
      return out.buffer;
    } else {
      return this._buildSlice();
    }
  }
  _buildSlice() {
    const base = new Uint8Array(this._slice);
    return base.buffer;
  }
  _writeBytesToSlice(off, bytes) {
    const arr = new Uint8Array(this._slice);
    arr.set(bytes, off);
    this._slice = arr;
    if (this._isFat) this._slices[this.selectedIndex] = this._slice;
  }
  static randomUUID() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    a[6] = (a[6] & 0x0f) | 0x40;
    a[8] = (a[8] & 0x3f) | 0x80;
    const s = Array.from(a).map(b=>('0'+b.toString(16)).slice(-2)).join('');
    return `${s.substr(0,8)}-${s.substr(8,4)}-${s.substr(12,4)}-${s.substr(16,4)}-${s.substr(20,12)}`;
  }
}
export class MachOFat {
  constructor(buffer) {
    this.buf = toUint8Array(buffer);
    if (!isFat(this.buf)) throw new Error('Not a fat binary');
    this.info = parseFat(this.buf);
  }
}
function align(v, a) {
  return Math.ceil(v / a) * a;
}
