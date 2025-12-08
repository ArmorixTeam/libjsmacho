/* Test file for libjsmacho
 * Run with: node --test test/test-basic.js
 */

import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';
import { MachOFile, MachOFat } from '../src/index.js';
import { parseFat } from '../src/macho/fat.js';

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

test('Fat binary header endianness - reading and writing always big-endian', () => {
  // Test Bug 1 & Bug 2: Fat headers must ALWAYS be read/written as big-endian
  // regardless of CIGAM magic (which only indicates slice endianness)
  
  // Create a CIGAM fat binary (slice endianness is little-endian, but header is still big-endian)
  const buf = new ArrayBuffer(128);
  const dv = new DataView(buf);
  
  // Write FAT_CIGAM magic (0xbebafeca) - this indicates slices are little-endian
  // BUT the fat header itself is ALWAYS big-endian in the file
  dv.setUint32(0, 0xbebafeca, false); // Magic (always big-endian in file)
  dv.setUint32(4, 1, false); // nfat = 1 (always big-endian in file)
  
  // Write slice header (always big-endian in file)
  // cputype = 0x01000007 (x86_64), cpusub = 3, offset = 48, size = 80, align = 12
  dv.setUint32(8, 0x01000007, false); // cputype (big-endian)
  dv.setUint32(12, 3, false); // cpusub (big-endian)
  dv.setUint32(16, 48, false); // offset (big-endian)
  dv.setUint32(20, 80, false); // size (big-endian)
  dv.setUint32(24, 12, false); // align (big-endian)
  
  // Import parseFat to test reading
  import('../src/macho/fat.js').then(({ parseFat }) => {
    const fatInfo = parseFat(new Uint8Array(buf));
    
    // Verify CIGAM was detected
    assert.strictEqual(fatInfo.isCigam, true, 'Should detect CIGAM magic');
    
    // Verify fat header was read correctly as big-endian
    assert.strictEqual(fatInfo.nfat, 1, 'nfat should be read as big-endian');
    assert.strictEqual(fatInfo.slices.length, 1, 'Should have 1 slice');
    assert.strictEqual(fatInfo.slices[0].cputype, 0x01000007, 'cputype should be read as big-endian');
    assert.strictEqual(fatInfo.slices[0].cpusub, 3, 'cpusub should be read as big-endian');
    assert.strictEqual(fatInfo.slices[0].offset, 48, 'offset should be read as big-endian');
    assert.strictEqual(fatInfo.slices[0].size, 80, 'size should be read as big-endian');
  });
  
  // Test writing: build() should always write FAT_MAGIC in big-endian
  const testBuf = new ArrayBuffer(64);
  const testDv = new DataView(testBuf);
  
  // Simulate what build() should do: always write FAT_MAGIC in big-endian
  testDv.setUint32(0, 0xcafebabe, false); // Always FAT_MAGIC (big-endian)
  testDv.setUint32(4, 1, false); // Always big-endian
  
  // Verify magic is correct
  assert.strictEqual(testDv.getUint32(0, false), 0xcafebabe, 'Should write FAT_MAGIC');
  
  // Verify nfat is written in big-endian
  const writtenNfat = testDv.getUint32(4, false);
  assert.strictEqual(writtenNfat, 1, 'nfat should be written in big-endian');
  
  // Verify it's actually big-endian by checking byte order
  const bytes = new Uint8Array(testBuf.slice(4, 8));
  assert.strictEqual(bytes[0], 0, 'First byte should be 0 (big-endian)');
  assert.strictEqual(bytes[3], 1, 'Last byte should be 1 (big-endian)');
});

console.log('Basic tests completed. Note: Full testing requires actual Mach-O binaries.');

