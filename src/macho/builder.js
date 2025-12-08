/* libjsmacho - https://armorixteam.xyz
 * This file is apart of libjsmacho.
 * Copyright 2025 Armorix Team

 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import { buildHeader, MAGIC } from './header.js';
import { Writer } from '../core/writer.js';
import { Reader } from '../core/reader.js';

function align(v, a) {
  return Math.ceil(v / a) * a;
}

/**
 * Builds a Mach-O binary from header, load commands, and original data
 * @param {Object} header - Parsed header object
 * @param {Array} loadCommands - Array of load command objects with {cmd, cmdsize, off, data}
 * @param {Uint8Array} originalSlice - Original binary data
 * @returns {ArrayBuffer} - Rebuilt binary
 */
export function buildSlice(header, loadCommands, originalSlice) {
  const headerSize = header.headerSize;
  const le = header.le;
  const is64 = header.is64;
  
  // Calculate new load commands size
  let loadCommandsSize = 0;
  for (const cmd of loadCommands) {
    loadCommandsSize += cmd.cmdsize;
  }
  // Align to 8-byte boundary (required by Mach-O spec)
  loadCommandsSize = align(loadCommandsSize, 8);
  
  // Find where segment data starts in original file
  const originalLoadCommandsEnd = header.headerSize + header.sizeofcmds;
  const originalSegmentDataStart = align(originalLoadCommandsEnd, 8);
  
  // New segment data starts after new load commands
  const newSegmentDataStart = align(headerSize + loadCommandsSize, 8);
  
  // Calculate offset delta for adjusting file offsets in segment commands
  const offsetDelta = newSegmentDataStart - originalSegmentDataStart;
  
  // Calculate total size needed
  const originalSegmentDataSize = originalSlice.length - originalSegmentDataStart;
  const totalSize = newSegmentDataStart + originalSegmentDataSize;
  
  const writer = new Writer(totalSize);
  const dv = writer.dv;
  
  // Build header with updated values
  const updatedHeader = {
    ...header,
    ncmds: loadCommands.length,
    sizeofcmds: loadCommandsSize
  };
  buildHeader(updatedHeader, writer);
  
  // Write load commands and adjust file offsets in segment commands
  let cmdOffset = headerSize;
  const originalReader = new Reader(originalSlice, le);
  
  for (const cmd of loadCommands) {
    // Write command header
    dv.setUint32(cmdOffset, cmd.cmd, le);
    dv.setUint32(cmdOffset + 4, cmd.cmdsize, le);
    
    // Get command data - use cmd.data if available, otherwise read from original
    let cmdData;
    if (cmd.data && cmd.data.length >= cmd.cmdsize) {
      cmdData = new Uint8Array(cmd.data);
    } else if (cmd.off !== undefined && cmd.off < originalSlice.length) {
      // Read from original file if data not provided
      cmdData = originalSlice.slice(cmd.off, cmd.off + cmd.cmdsize);
    } else {
      // Fallback: create empty data
      cmdData = new Uint8Array(cmd.cmdsize);
    }
    
    const cmdDv = new DataView(cmdData.buffer, cmdData.byteOffset, cmdData.byteLength);
    
    // Handle segment commands specially - need to adjust file offsets
    if (cmd.cmd === 0x1 || cmd.cmd === 0x19) { // LC_SEGMENT or LC_SEGMENT_64
      // Adjust fileoff if it points to segment data
      const fileoffOffset = is64 ? 40 : 32;
      
      // Read original fileoff from command data
      let originalFileoff;
      if (is64) {
        const low = cmdDv.getUint32(fileoffOffset, le);
        const high = cmdDv.getUint32(fileoffOffset + 4, le);
        originalFileoff = Number((BigInt(high) << 32n) | BigInt(low));
      } else {
        originalFileoff = cmdDv.getUint32(fileoffOffset, le);
      }
      
      // Only adjust if this offset points to segment data area (and offset changed)
      if (offsetDelta !== 0 && originalFileoff >= originalSegmentDataStart) {
        const newFileoff = originalFileoff + offsetDelta;
        if (is64) {
          const low = Number(BigInt(newFileoff) & 0xffffffffn);
          const high = Number((BigInt(newFileoff) >> 32n) & 0xffffffffn);
          cmdDv.setUint32(fileoffOffset, low, le);
          cmdDv.setUint32(fileoffOffset + 4, high, le);
        } else {
          cmdDv.setUint32(fileoffOffset, newFileoff, le);
        }
      }
    } else if (cmd.cmd === 0x1d) { // LC_CODE_SIGNATURE
      // Code signature command - adjust dataoff
      if (cmdData.length >= 12) {
        const originalDataoff = cmdDv.getUint32(8, le);
        
        // Adjust if it points to segment data area (and offset changed)
        if (offsetDelta !== 0 && originalDataoff >= originalSegmentDataStart) {
          const newDataoff = originalDataoff + offsetDelta;
          cmdDv.setUint32(8, newDataoff, le);
        }
      }
    }
    
    // Write the command data (skip first 8 bytes which are cmd/cmdsize)
    if (cmdData.length > 8) {
      writer.writeBytes(cmdOffset + 8, cmdData.slice(8));
    }
    
    cmdOffset += cmd.cmdsize;
  }
  
  // Copy segment data from original (everything after load commands)
  if (originalSegmentDataSize > 0) {
    const segmentData = originalSlice.slice(originalSegmentDataStart);
    writer.writeBytes(newSegmentDataStart, segmentData);
  }
  
  return writer.toArrayBuffer();
}

