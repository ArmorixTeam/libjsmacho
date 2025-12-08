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
import { buildSlice } from './macho/builder.js';
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
    // Check if code signature already exists
    if (findCodeSignature(this.loadCommands)) {
      throw new Error('Code signature already exists');
    }
    
    // Calculate where the signature data will be placed (at end of file)
    const originalLoadCommandsEnd = this.header.headerSize + this.header.sizeofcmds;
    const originalSegmentDataStart = align(originalLoadCommandsEnd, 8);
    const originalSegmentDataSize = this._slice.length - originalSegmentDataStart;
    const signatureDataOffset = originalSegmentDataStart + originalSegmentDataSize;
    
    // Create code signature command with proper data offset
    const arr = new Uint8Array(8 + 8); // cmd(4) + cmdsize(4) + dataoff(4) + datasize(4)
    const dv = new DataView(arr.buffer);
    const le = this.header.le;
    dv.setUint32(0, 0x1d, le); // LC_CODE_SIGNATURE
    dv.setUint32(4, 16, le); // cmdsize
    dv.setUint32(8, signatureDataOffset, le); // dataoff
    dv.setUint32(12, 0, le); // datasize (0 for placeholder)
    
    this.loadCommands.push({ cmd: 0x1d, cmdsize: 16, off: 0, data: arr });
  }
  setUUID(uuid) {
    // Validate UUID format
    const hex = uuid.replace(/-/g, '');
    if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
      throw new Error('Invalid UUID format');
    }
    
    const buf = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      buf[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    
    const uuidCmd = this.loadCommands.find(c => c.cmd === 0x1b);
    if (uuidCmd) {
      // Update existing UUID command
      const newData = new Uint8Array(uuidCmd.data);
      newData.set(buf, 8);
      uuidCmd.data = newData;
    } else {
      // Create new UUID command
      const arr = new Uint8Array(8 + 16);
      const dv = new DataView(arr.buffer);
      dv.setUint32(0, 0x1b, this.header.le);
      dv.setUint32(4, 24, this.header.le);
      arr.set(buf, 8);
      this.loadCommands.push({ cmd: 0x1b, cmdsize: 24, off: 0, data: arr });
    }
  }
  injectSegment(name, bytes) {
    if (!name || name.length === 0 || name.length > 16) {
      throw new Error('Segment name must be 1-16 characters');
    }
    if (!bytes || bytes.length === 0) {
      throw new Error('Segment data cannot be empty');
    }
    
    const n = Math.min(16, name.length);
    const segname = new Uint8Array(16);
    for (let i = 0; i < n; i++) segname[i] = name.charCodeAt(i);
    
    // Calculate where this segment will be placed in the file
    // It will be appended after existing segment data
    const originalLoadCommandsEnd = this.header.headerSize + this.header.sizeofcmds;
    const originalSegmentDataStart = align(originalLoadCommandsEnd, 8);
    const originalSegmentDataSize = this._slice.length - originalSegmentDataStart;
    const newFileoff = originalSegmentDataStart + originalSegmentDataSize;
    
    // Calculate VM address - place after the last segment's end
    let maxVmaddr = 0;
    let maxVmsize = 0;
    for (const seg of this.segments) {
      const segEnd = seg.vmaddr + seg.vmsize;
      if (segEnd > maxVmaddr) {
        maxVmaddr = segEnd;
        maxVmsize = seg.vmsize;
      }
    }
    // Align VM address to page boundary (0x1000)
    const newVmaddr = align(maxVmaddr, 0x1000);
    
    const is64 = this.header.is64;
    const cmdSize = is64 ? 72 + bytes.length : 56 + bytes.length;
    const segbuf = new Uint8Array(cmdSize);
    const dv = new DataView(segbuf.buffer);
    const le = this.header.le;
    
    // Write command header
    dv.setUint32(0, is64 ? 0x19 : 0x1, le);
    dv.setUint32(4, cmdSize, le);
    
    // Write segment name
    segbuf.set(segname, 8);
    
    // Write VM address and size
    if (is64) {
      const vmaddrLow = Number(BigInt(newVmaddr) & 0xffffffffn);
      const vmaddrHigh = Number((BigInt(newVmaddr) >> 32n) & 0xffffffffn);
      dv.setUint32(24, vmaddrLow, le);
      dv.setUint32(28, vmaddrHigh, le);
      const vmsizeLow = Number(BigInt(bytes.length) & 0xffffffffn);
      const vmsizeHigh = Number((BigInt(bytes.length) >> 32n) & 0xffffffffn);
      dv.setUint32(32, vmsizeLow, le);
      dv.setUint32(36, vmsizeHigh, le);
      dv.setUint32(40, newFileoff, le);
      dv.setUint32(44, 0, le); // fileoff high (always 0 for file offsets)
      dv.setUint32(48, bytes.length, le);
      dv.setUint32(52, 0, le); // filesize high
      dv.setUint32(56, 0, le); // maxprot
      dv.setUint32(60, 0, le); // initprot
      dv.setUint32(64, 0, le); // nsects
      dv.setUint32(68, 0, le); // flags
      segbuf.set(bytes, 72);
    } else {
      dv.setUint32(24, newVmaddr, le);
      dv.setUint32(28, bytes.length, le);
      dv.setUint32(32, newFileoff, le);
      dv.setUint32(36, bytes.length, le);
      dv.setUint32(40, 0, le); // maxprot
      dv.setUint32(44, 0, le); // initprot
      dv.setUint32(48, 0, le); // nsects
      dv.setUint32(52, 0, le); // flags
      segbuf.set(bytes, 56);
    }
    
    this.loadCommands.push({ cmd: is64 ? 0x19 : 0x1, cmdsize: cmdSize, off: 0, data: segbuf });
    this.segments.push({ 
      name, 
      vmaddr: newVmaddr, 
      vmsize: bytes.length, 
      fileoff: newFileoff, 
      filesize: bytes.length, 
      nsects: 0, 
      sects: [], 
      headerOff: 0, 
      cmdsize: cmdSize 
    });
  }
  patch(offset, data) {
    this._writeBytesToSlice(offset, data);
  }
  build() {
    if (this._isFat) {
      const outSlices = [];
      for (let i = 0; i < this._slices.length; i++) {
        if (i === this.selectedIndex) {
          // Rebuild the selected slice
          const rebuilt = this._buildSlice();
          outSlices.push(new Uint8Array(rebuilt));
        } else {
          // Keep other slices as-is (they're already Uint8Array)
          outSlices.push(this._slices[i] instanceof Uint8Array ? this._slices[i] : new Uint8Array(this._slices[i]));
        }
      }
      
      // Calculate fat header size
      const fatHeaderSize = 8 + this._fat.slices.length * 20;
      
      // Align slices according to their alignment requirements
      let currentOffset = fatHeaderSize;
      const alignedSlices = [];
      
      for (let i = 0; i < outSlices.length; i++) {
        const slice = outSlices[i];
        // align field is a power-of-2 exponent (e.g., 12 means 2^12 = 4096)
        const alignExponent = this._fat.slices[i].align || 12; // Default to 12 (4KB)
        const alignment = Math.pow(2, alignExponent);
        currentOffset = align(currentOffset, alignment);
        alignedSlices.push({ offset: currentOffset, data: slice });
        currentOffset += slice.byteLength;
      }
      
      // Calculate total size
      const totalSize = currentOffset;
      const out = new Uint8Array(totalSize);
      const dv = new DataView(out.buffer);
      
      // Fat binary headers must ALWAYS be written in big-endian format
      // regardless of whether the original was CIGAM or not.
      // CIGAM is only relevant for reading; we always write standard FAT_MAGIC.
      const FAT_MAGIC = 0xcafebabe;
      
      // Write fat header (always big-endian)
      dv.setUint32(0, FAT_MAGIC, false);
      dv.setUint32(4, this._fat.nfat, false);
      
      // Write slice headers and data (always big-endian)
      let headerOff = 8;
      for (let i = 0; i < alignedSlices.length; i++) {
        const aligned = alignedSlices[i];
        const s = this._fat.slices[i];
        
        // Write slice header (always big-endian)
        dv.setUint32(headerOff, s.cputype, false);
        dv.setUint32(headerOff + 4, s.cpusub, false);
        dv.setUint32(headerOff + 8, aligned.offset, false);
        dv.setUint32(headerOff + 12, aligned.data.byteLength, false);
        dv.setUint32(headerOff + 16, s.align, false);
        headerOff += 20;
        
        // Write slice data
        out.set(aligned.data, aligned.offset);
      }
      
      return out.buffer;
    } else {
      return this._buildSlice();
    }
  }
  _buildSlice() {
    return buildSlice(this.header, this.loadCommands, this._slice);
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
