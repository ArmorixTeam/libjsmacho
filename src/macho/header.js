/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import { Reader } from '../core/reader.js';
export const MAGIC = {
  MH_MAGIC: 0xfeedface,
  MH_CIGAM: 0xcefaedfe,
  MH_MAGIC_64: 0xfeedfacf,
  MH_CIGAM_64: 0xcffaedfe,
  FAT_MAGIC: 0xcafebabe,
  FAT_CIGAM: 0xbebafeca
};
export function parseHeader(buf) {
  const r = new Reader(buf);
  const magic = r.u32(0);
  let le = true;
  let is64 = false;
  if (magic === MAGIC.MH_MAGIC) le = true; else if (magic === MAGIC.MH_CIGAM) le = false; else if (magic === MAGIC.MH_MAGIC_64) { le = true; is64 = true; } else if (magic === MAGIC.MH_CIGAM_64) { le = false; is64 = true; } else throw new Error('Not a Mach-O header');
  const dv = new DataView(r.buf.buffer, r.buf.byteOffset, r.buf.byteLength);
  const readU32 = (off)=>dv.getUint32(off, le);
  const readU16 = (off)=>dv.getUint16(off, le);
  const cputype = readU32(4);
  const cpusub = readU32(8);
  const filetype = readU32(12);
  const ncmds = readU32(16);
  const sizeofcmds = readU32(20);
  const flags = readU32(24);
  const idx = is64 ? 32 : 28;
  return {
    magic,
    le,
    is64,
    cputype,
    cpusub,
    filetype,
    ncmds,
    sizeofcmds,
    flags,
    headerSize: idx
  };
}
export function buildHeader(obj, writer) {
  const dv = writer.dv;
  const le = obj.le !== undefined ? obj.le : true;
  dv.setUint32(0, obj.magic, le);
  dv.setUint32(4, obj.cputype, le);
  dv.setUint32(8, obj.cpusub, le);
  dv.setUint32(12, obj.filetype, le);
  dv.setUint32(16, obj.ncmds, le);
  dv.setUint32(20, obj.sizeofcmds, le);
  dv.setUint32(24, obj.flags, le);
  if (obj.is64) dv.setUint32(28, 0, le);
}
