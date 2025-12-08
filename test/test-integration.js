/* Integration tests for libjsmacho
 * These tests require actual Mach-O binaries to fully validate the fixes
 * Run with: node --test test/test-integration.js
 * 
 * To get test binaries (on macOS):
 *   - Use /usr/bin/ls or any system binary
 *   - Compile a simple C program: echo 'int main(){return 0;}' | gcc -x c - -o test_binary
 */

import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';
import { MachOFile } from '../src/index.js';
import { strip } from '../src/operations/strip.js';

// Helper to check if we can read a file (for optional test files)
function fileExists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

// Test with actual system binaries (if on macOS)
const TEST_BINARIES = [
  '/usr/bin/ls',        // Standard system binary
  '/usr/bin/cat',       // Another system binary
];

test('Parse real Mach-O binary (if available)', async () => {
  let tested = false;
  
  for (const binaryPath of TEST_BINARIES) {
    if (!fileExists(binaryPath)) continue;
    
    tested = true;
    const buf = readFileSync(binaryPath);
    const macho = new MachOFile(buf);
    
    assert(macho.header !== undefined, 'Should parse header');
    assert(Array.isArray(macho.loadCommands), 'Should have load commands array');
    assert(Array.isArray(macho.segments), 'Should have segments array');
    
    console.log(`  ✓ Parsed ${binaryPath}`);
    console.log(`    - Header: ${macho.header.is64 ? '64-bit' : '32-bit'}, ${macho.header.le ? 'little-endian' : 'big-endian'}`);
    console.log(`    - Load commands: ${macho.loadCommands.length}`);
    console.log(`    - Segments: ${macho.segments.length}`);
    console.log(`    - Fat binary: ${macho.isFat()}`);
    
    break;
  }
  
  if (!tested) {
    console.log('  ⚠ Skipped: No test binaries found (not on macOS or binaries not accessible)');
  }
});

test('Roundtrip test - parse and rebuild (if binary available)', async () => {
  let tested = false;
  
  for (const binaryPath of TEST_BINARIES) {
    if (!fileExists(binaryPath)) continue;
    
    tested = true;
    const originalBuf = readFileSync(binaryPath);
    const macho = new MachOFile(originalBuf);
    
    // Build should not throw
    const rebuilt = macho.build();
    assert(rebuilt instanceof ArrayBuffer, 'Build should return ArrayBuffer');
    assert(rebuilt.byteLength > 0, 'Rebuilt binary should have size > 0');
    
    // Should be able to parse rebuilt binary
    const macho2 = new MachOFile(rebuilt);
    assert.strictEqual(macho2.header.is64, macho.header.is64, 'Header should match');
    assert.strictEqual(macho2.header.filetype, macho.header.filetype, 'File type should match');
    
    console.log(`  ✓ Roundtrip test passed for ${binaryPath}`);
    
    break;
  }
  
  if (!tested) {
    console.log('  ⚠ Skipped: No test binaries found');
  }
});

test('Modify and rebuild - add UUID (if binary available)', async () => {
  let tested = false;
  
  for (const binaryPath of TEST_BINARIES) {
    if (!fileExists(binaryPath)) continue;
    
    tested = true;
    const originalBuf = readFileSync(binaryPath);
    const macho = new MachOFile(originalBuf);
    
    const originalCmdCount = macho.loadCommands.length;
    const testUUID = '12345678-1234-1234-1234-123456789abc';
    
    // Add UUID
    macho.setUUID(testUUID);
    
    // Should have one more command (or replaced existing UUID)
    assert(macho.loadCommands.length >= originalCmdCount, 'Should have same or more commands');
    
    // Build should succeed
    const rebuilt = macho.build();
    assert(rebuilt instanceof ArrayBuffer);
    
    // Parse rebuilt and verify UUID command exists
    const macho2 = new MachOFile(rebuilt);
    const uuidCmd = macho2.loadCommands.find(c => c.cmd === 0x1b);
    assert(uuidCmd !== undefined, 'UUID command should exist in rebuilt binary');
    
    console.log(`  ✓ UUID modification test passed for ${binaryPath}`);
    
    break;
  }
  
  if (!tested) {
    console.log('  ⚠ Skipped: No test binaries found');
  }
});

test('Strip code signature - verify removal (if binary available)', async () => {
  let tested = false;
  
  for (const binaryPath of TEST_BINARIES) {
    if (!fileExists(binaryPath)) continue;
    
    tested = true;
    const originalBuf = readFileSync(binaryPath);
    const macho = new MachOFile(originalBuf);
    
    // Check if code signature exists
    const originalSig = macho.findCodeSignature();
    const hadSignature = originalSig !== null;
    
    if (hadSignature) {
      const originalCmdCount = macho.loadCommands.length;
      
      // Strip signature
      const removed = macho.stripCodeSignature();
      assert.strictEqual(removed, true, 'Should have removed signature');
      assert.strictEqual(macho.loadCommands.length, originalCmdCount - 1, 'Should have one less command');
      
      // Build should succeed
      const rebuilt = macho.build();
      assert(rebuilt instanceof ArrayBuffer);
      
      // Parse rebuilt and verify signature is gone
      const macho2 = new MachOFile(rebuilt);
      const sigAfter = macho2.findCodeSignature();
      assert.strictEqual(sigAfter, null, 'Signature should be gone after rebuild');
      
      console.log(`  ✓ Code signature strip test passed for ${binaryPath}`);
    } else {
      console.log(`  ⚠ ${binaryPath} has no code signature to strip`);
    }
    
    break;
  }
  
  if (!tested) {
    console.log('  ⚠ Skipped: No test binaries found');
  }
});

test('Fat binary parsing (if available)', async () => {
  // Try to find a fat binary (usually in /usr/lib or system frameworks)
  const FAT_BINARIES = [
    '/usr/lib/libSystem.B.dylib',
    '/System/Library/Frameworks/Foundation.framework/Foundation',
  ];
  
  let tested = false;
  
  for (const binaryPath of FAT_BINARIES) {
    if (!fileExists(binaryPath)) continue;
    
    tested = true;
    const buf = readFileSync(binaryPath);
    const macho = new MachOFile(buf);
    
    if (macho.isFat()) {
      const slices = macho.getSlices();
      assert(slices.length > 1, 'Fat binary should have multiple slices');
      console.log(`  ✓ Fat binary parsed: ${binaryPath}`);
      console.log(`    - Slices: ${slices.length}`);
      
      // Test slice selection
      for (let i = 0; i < slices.length; i++) {
        macho.selectSlice(i);
        assert.strictEqual(macho.selectedIndex, i, 'Slice selection should work');
      }
      
      // Test rebuilding fat binary
      const rebuilt = macho.build();
      assert(rebuilt instanceof ArrayBuffer);
      assert(rebuilt.byteLength > 0);
      
      console.log(`  ✓ Fat binary rebuild successful`);
    } else {
      console.log(`  ⚠ ${binaryPath} is not a fat binary`);
    }
    
    break;
  }
  
  if (!tested) {
    console.log('  ⚠ Skipped: No fat binaries found for testing');
  }
});

console.log('\nIntegration tests completed.');
console.log('For full testing, use actual Mach-O binaries from macOS system.');

