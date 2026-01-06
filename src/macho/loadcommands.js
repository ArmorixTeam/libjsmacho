/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import { Reader } from '../core/reader.js';
export const LC = {
  SEGMENT: 0x1,
  SYMTAB: 0x2,
  DYSYMTAB: 0xb,
  LOAD_DYLIB: 0xc,
  ID_DYLIB: 0xd,
  SEGMENT_64: 0x19,
  UUID: 0x1b,
  RPATH: 0x1c,
  CODE_SIGNATURE: 0x1d,
  REEXPORT_DYLIB: 0x1f,
  ENCRYPTION_INFO_64: 0x2c,
  MAIN: 0x80000028,
  DYLD_INFO_ONLY: 0x80000022
};
export function parseLoadCommands(buf, header) {
  const r = new Reader(buf, header.le);
  let off = header.headerSize;
  const cmds = [];
  const maxOffset = header.headerSize + header.sizeofcmds;
  
  // Bounds check
  if (off + header.sizeofcmds > buf.length) {
    throw new Error(`Load commands extend beyond file: headerSize=${header.headerSize}, sizeofcmds=${header.sizeofcmds}, fileSize=${buf.length}`);
  }
  
  for (let i = 0; i < header.ncmds; i++) {
    // Check if we can read command header
    if (off + 8 > buf.length) {
      throw new Error(`Load command ${i} header truncated at offset ${off}`);
    }
    
    const cmd = r.u32(off);
    const cmdsize = r.u32(off + 4);
    
    // Validate cmdsize
    if (cmdsize < 8) {
      throw new Error(`Load command ${i} has invalid size: ${cmdsize} (minimum 8)`);
    }
    
    // Check if command extends beyond declared load commands area
    if (off + cmdsize > maxOffset) {
      throw new Error(`Load command ${i} extends beyond sizeofcmds: offset=${off}, size=${cmdsize}, maxOffset=${maxOffset}`);
    }
    
    // Check if command extends beyond file
    if (off + cmdsize > buf.length) {
      throw new Error(`Load command ${i} extends beyond file: offset=${off}, size=${cmdsize}, fileSize=${buf.length}`);
    }
    
    const data = r.slice(off, cmdsize);
    cmds.push({ cmd, cmdsize, off, data });
    off += cmdsize;
  }
  
  return cmds;
}
export function findCommand(cmds, type) {
  return cmds.filter(c => c.cmd === type);
}
export function replaceCommand(cmds, type, newCmd) {
  for (let i = 0; i < cmds.length; i++) if (cmds[i].cmd === type) { cmds[i] = newCmd; return; }
  cmds.push(newCmd);
}
