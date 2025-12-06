/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import { Reader } from '../core/reader.js';
export function parseSegments(buf, header, cmds) {
  const r = new Reader(buf, header.le);
  const segs = [];
  for (const lc of cmds) {
    if (lc.cmd === 0x19 || lc.cmd === 0x1) {
      const is64 = header.is64 && lc.cmd === 0x19;
      const name = String.fromCharCode.apply(null, Array.from(lc.data.slice(8, 24))).replace(/\0.*$/,'');
      const vmaddr = is64 ? Number(r.u64(lc.off + 24)) : r.u32(lc.off + 24);
      const vmsize = is64 ? Number(r.u64(lc.off + 32)) : r.u32(lc.off + 28);
      const fileoff = is64 ? Number(r.u64(lc.off + 40)) : r.u32(lc.off + 32);
      const filesize = is64 ? Number(r.u64(lc.off + 48)) : r.u32(lc.off + 36);
      const nsects = is64 ? r.u32(lc.off + 64) : r.u32(lc.off + 48);
      const sects = [];
      let sectOff = lc.off + (is64 ? 72 : 56);
      for (let i = 0; i < nsects; i++) {
        const n = String.fromCharCode.apply(null, Array.from(r.bytes(sectOff, 16))).replace(/\0.*$/,'');
        const segname = String.fromCharCode.apply(null, Array.from(r.bytes(sectOff + 16, 16))).replace(/\0.*$/,'');
        const addr = is64 ? Number(r.u64(sectOff + 32)) : r.u32(sectOff + 32);
        const size = is64 ? Number(r.u64(sectOff + 40)) : r.u32(sectOff + 36);
        const offset = r.u32(sectOff + (is64 ? 56 : 44));
        sects.push({ name: n, segname, addr, size, offset });
        sectOff += is64 ? 80 : 68;
      }
      segs.push({ name, vmaddr, vmsize, fileoff, filesize, nsects, sects, headerOff: lc.off, cmdsize: lc.cmdsize });
    }
  }
  return segs;
}
