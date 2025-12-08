/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import { Reader } from '../core/reader.js';

export function isFat(buf) {
  if (buf.length < 4) return false;
  const dv = new DataView(buf.buffer, buf.byteOffset, 4);
  const magic = dv.getUint32(0, false);
  return magic === 0xcafebabe || magic === 0xbebafeca;
}

export function parseFat(buf) {
  if (buf.length < 8) {
    throw new Error('Fat binary too small');
  }
  
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, false);
  const isCigam = magic === 0xbebafeca;
  const le = isCigam; // CIGAM means little-endian
  
  const nfat = dv.getUint32(4, le);
  
  // Bounds check
  if (nfat < 1 || nfat > 1000) {
    throw new Error(`Invalid fat binary: nfat_arch = ${nfat}`);
  }
  
  const headerSize = 8 + nfat * 20;
  if (buf.length < headerSize) {
    throw new Error('Fat binary header truncated');
  }
  
  const slices = [];
  let off = 8;
  for (let i = 0; i < nfat; i++) {
    if (off + 20 > buf.length) {
      throw new Error(`Fat binary slice ${i} header truncated`);
    }
    
    const cputype = dv.getUint32(off, le);
    const cpusub = dv.getUint32(off + 4, le);
    const offset = dv.getUint32(off + 8, le);
    const size = dv.getUint32(off + 12, le);
    const align = dv.getUint32(off + 16, le);
    
    // Bounds check slice
    if (offset < headerSize || offset + size > buf.length) {
      throw new Error(`Fat binary slice ${i} out of bounds: offset=${offset}, size=${size}, fileSize=${buf.length}`);
    }
    
    if (size === 0) {
      throw new Error(`Fat binary slice ${i} has zero size`);
    }
    
    slices.push({ cputype, cpusub, offset, size, align });
    off += 20;
  }
  
  return { magic, nfat, slices, isCigam, le };
}

export function extractSlice(buf, slice) {
  if (slice.offset + slice.size > buf.length) {
    throw new Error('Slice extraction out of bounds');
  }
  return buf.slice(slice.offset, slice.offset + slice.size);
}
