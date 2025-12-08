/* Test file for libjsmacho
 * Run with: node --test test/test-basic.js
 */

import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';
import { MachOFile, MachOFat } from '../src/index.js';

// Helper to check if we can read a file (for optional test files)
function fileExists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

test('MachOFile constructor - invalid input', () => {
  assert.throws(() => {
    new MachOFile(null);
  }, /Unsupported buffer input/);
});

test('MachOFile - parse valid Mach-O header structure', () => {
  // Create a minimal valid Mach-O 64-bit header
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  
  // Write MH_MAGIC_64 (0xfeedfacf) - 64-bit, little-endian
  dv.setUint32(0, 0xfeedfacf, true);
  // CPU type: x86_64
  dv.setUint32(4, 0x01000007, true);
  // CPU subtype: x86_64_all
  dv.setUint32(8, 0x00000003, true);
  // File type: executable
  dv.setUint32(12, 0x00000002, true);
  // ncmds: 0 load commands
  dv.setUint32(16, 0, true);
  // sizeofcmds: 0
  dv.setUint32(20, 0, true);
  // flags: 0
  dv.setUint32(24, 0, true);
  // reserved: 0 (64-bit only)
  dv.setUint32(28, 0, true);
  
  const macho = new MachOFile(new Uint8Array(buf));
  assert.strictEqual(macho.header.is64, true);
  assert.strictEqual(macho.header.le, true);
  assert.strictEqual(macho.header.filetype, 0x00000002);
  assert.strictEqual(macho.loadCommands.length, 0);
});

test('setUUID - validation', () => {
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  dv.setUint32(0, 0xfeedfacf, true);
  dv.setUint32(4, 0x01000007, true);
  dv.setUint32(8, 0x00000003, true);
  dv.setUint32(12, 0x00000002, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(28, 0, true);
  
  const macho = new MachOFile(new Uint8Array(buf));
  
  // Invalid UUID should throw
  assert.throws(() => {
    macho.setUUID('invalid-uuid');
  }, /Invalid UUID format/);
  
  // Valid UUID should work
  assert.doesNotThrow(() => {
    macho.setUUID('12345678-1234-1234-1234-123456789abc');
  });
  
  assert.strictEqual(macho.loadCommands.length, 1);
  assert.strictEqual(macho.loadCommands[0].cmd, 0x1b); // LC_UUID
});

test('injectSegment - validation', () => {
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  dv.setUint32(0, 0xfeedfacf, true);
  dv.setUint32(4, 0x01000007, true);
  dv.setUint32(8, 0x00000003, true);
  dv.setUint32(12, 0x00000002, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(28, 0, true);
  
  const macho = new MachOFile(new Uint8Array(buf));
  
  // Invalid segment name should throw
  assert.throws(() => {
    macho.injectSegment('', new Uint8Array([1, 2, 3]));
  }, /Segment name must be 1-16 characters/);
  
  assert.throws(() => {
    macho.injectSegment('a'.repeat(17), new Uint8Array([1, 2, 3]));
  }, /Segment name must be 1-16 characters/);
  
  // Empty data should throw
  assert.throws(() => {
    macho.injectSegment('TEST', new Uint8Array(0));
  }, /Segment data cannot be empty/);
  
  // Valid segment should work
  assert.doesNotThrow(() => {
    macho.injectSegment('TEST', new Uint8Array([1, 2, 3, 4]));
  });
  
  assert.strictEqual(macho.loadCommands.length, 1);
  assert.strictEqual(macho.loadCommands[0].cmd, 0x19); // LC_SEGMENT_64
});

test('build() - roundtrip without modifications', () => {
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  dv.setUint32(0, 0xfeedfacf, true);
  dv.setUint32(4, 0x01000007, true);
  dv.setUint32(8, 0x00000003, true);
  dv.setUint32(12, 0x00000002, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(28, 0, true);
  
  const original = new Uint8Array(buf);
  const macho = new MachOFile(original);
  
  // Build should produce a valid binary
  const rebuilt = macho.build();
  assert(rebuilt instanceof ArrayBuffer);
  assert(rebuilt.byteLength > 0);
  
  // Should be able to parse the rebuilt binary
  const macho2 = new MachOFile(rebuilt);
  assert.strictEqual(macho2.header.is64, macho.header.is64);
  assert.strictEqual(macho2.header.ncmds, macho.header.ncmds);
});

test('build() - with modifications', () => {
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  dv.setUint32(0, 0xfeedfacf, true);
  dv.setUint32(4, 0x01000007, true);
  dv.setUint32(8, 0x00000003, true);
  dv.setUint32(12, 0x00000002, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(28, 0, true);
  
  const macho = new MachOFile(new Uint8Array(buf));
  
  // Add UUID
  macho.setUUID('12345678-1234-1234-1234-123456789abc');
  assert.strictEqual(macho.loadCommands.length, 1);
  
  // Build and verify
  const rebuilt = macho.build();
  const macho2 = new MachOFile(rebuilt);
  
  // Should have the UUID command
  assert.strictEqual(macho2.loadCommands.length, 1);
  assert.strictEqual(macho2.loadCommands[0].cmd, 0x1b);
});

test('stripCodeSignature - removes command', () => {
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  dv.setUint32(0, 0xfeedfacf, true);
  dv.setUint32(4, 0x01000007, true);
  dv.setUint32(8, 0x00000003, true);
  dv.setUint32(12, 0x00000002, true);
  
  // Add a code signature command (0x1d)
  // ncmds: 1
  dv.setUint32(16, 1, true);
  // sizeofcmds: 16 (8 byte header + 8 byte data)
  dv.setUint32(20, 16, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(28, 0, true);
  
  // Load command at offset 32: LC_CODE_SIGNATURE
  dv.setUint32(32, 0x1d, true); // cmd
  dv.setUint32(36, 16, true); // cmdsize
  dv.setUint32(40, 48, true); // dataoff
  dv.setUint32(44, 0, true); // datasize
  
  const macho = new MachOFile(new Uint8Array(buf));
  const initialCount = macho.loadCommands.length;
  
  const removed = macho.stripCodeSignature();
  assert.strictEqual(removed, initialCount > 0);
  
  // After stripping, command count should be reduced
  assert.strictEqual(macho.loadCommands.length, Math.max(0, initialCount - 1));
});

console.log('Basic tests completed. Note: Full testing requires actual Mach-O binaries.');

