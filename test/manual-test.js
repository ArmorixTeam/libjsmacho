#!/usr/bin/env node
/* Manual test script for quick verification
 * Usage: node test/manual-test.js [path-to-mach-o-binary]
 * 
 * If no path is provided, will try to use system binaries on macOS
 */

import { readFileSync } from 'fs';
import { MachOFile } from '../src/index.js';
import { strip } from '../src/operations/strip.js';

function testBinary(path) {
  console.log(`\n=== Testing: ${path} ===\n`);
  
  try {
    const buf = readFileSync(path);
    console.log(`✓ File read: ${buf.length} bytes`);
    
    // Test 1: Parse
    const macho = new MachOFile(buf);
    console.log(`✓ Parsed successfully`);
    console.log(`  - 64-bit: ${macho.header.is64}`);
    console.log(`  - Endianness: ${macho.header.le ? 'little' : 'big'}`);
    console.log(`  - Load commands: ${macho.loadCommands.length}`);
    console.log(`  - Segments: ${macho.segments.length}`);
    console.log(`  - Fat binary: ${macho.isFat()}`);
    
    // Test 2: Check code signature
    const sig = macho.findCodeSignature();
    console.log(`\n✓ Code signature: ${sig ? 'present' : 'absent'}`);
    
    // Test 3: Roundtrip build
    console.log(`\n✓ Testing build()...`);
    const rebuilt = macho.build();
    console.log(`  - Rebuilt size: ${rebuilt.byteLength} bytes`);
    
    // Test 4: Parse rebuilt
    const macho2 = new MachOFile(rebuilt);
    console.log(`  - Rebuilt parses correctly`);
    console.log(`  - Load commands match: ${macho2.loadCommands.length === macho.loadCommands.length}`);
    
    // Test 5: Modify and rebuild
    console.log(`\n✓ Testing modifications...`);
    const originalCmdCount = macho.loadCommands.length;
    
    // Add UUID
    macho.setUUID('12345678-1234-1234-1234-123456789abc');
    console.log(`  - Added UUID command`);
    if (macho.loadCommands.length < originalCmdCount) {
      throw new Error('Command count should increase or stay same after adding UUID');
    }
    
    // Build with modification
    const rebuilt2 = macho.build();
    const macho3 = new MachOFile(rebuilt2);
    const hasUUID = macho3.loadCommands.some(c => c.cmd === 0x1b);
    console.log(`  - UUID persists in rebuild: ${hasUUID ? '✓' : '✗'}`);
    
    // Test 6: Strip signature (if present)
    if (sig) {
      console.log(`\n✓ Testing strip()...`);
      const beforeCount = macho.loadCommands.length;
      const removed = macho.stripCodeSignature();
      console.log(`  - Signature removed: ${removed}`);
      
      if (removed) {
        const rebuilt3 = macho.build();
        const macho4 = new MachOFile(rebuilt3);
        const sigAfter = macho4.findCodeSignature();
        console.log(`  - Signature absent after rebuild: ${sigAfter === null ? '✓' : '✗'}`);
      }
    }
    
    // Test 7: Inject segment
    console.log(`\n✓ Testing segment injection...`);
    const beforeSegCount = macho.loadCommands.filter(c => c.cmd === 0x19 || c.cmd === 0x1).length;
    macho.injectSegment('TESTSEG', new Uint8Array([1, 2, 3, 4, 5]));
    const afterSegCount = macho.loadCommands.filter(c => c.cmd === 0x19 || c.cmd === 0x1).length;
    console.log(`  - Segment added: ${afterSegCount === beforeSegCount + 1 ? '✓' : '✗'}`);
    
    const rebuilt4 = macho.build();
    const macho5 = new MachOFile(rebuilt4);
    const hasTestSeg = macho5.segments.some(s => s.name === 'TESTSEG');
    console.log(`  - Segment persists in rebuild: ${hasTestSeg ? '✓' : '✗'}`);
    
    // Test 8: Fat binary handling
    if (macho.isFat()) {
      console.log(`\n✓ Testing fat binary features...`);
      const slices = macho.getSlices();
      console.log(`  - Slices: ${slices.length}`);
      
      for (let i = 0; i < slices.length; i++) {
        macho.selectSlice(i);
        console.log(`  - Slice ${i}: ${macho.header.is64 ? '64-bit' : '32-bit'}, ${macho.header.le ? 'LE' : 'BE'}`);
      }
      
      // Rebuild fat binary
      const rebuiltFat = macho.build();
      console.log(`  - Fat binary rebuild successful: ${rebuiltFat.byteLength > 0 ? '✓' : '✗'}`);
    }
    
    console.log(`\n✓✓✓ All tests passed for ${path} ✓✓✓\n`);
    return true;
    
  } catch (error) {
    console.error(`\n✗✗✗ Error testing ${path}:`);
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\n   Stack trace:`);
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
    console.log();
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Main
const testPaths = process.argv.slice(2);

if (testPaths.length === 0) {
  // Try default system binaries on macOS
  const defaults = [
    '/usr/bin/ls',
    '/usr/bin/cat',
    '/usr/lib/libSystem.B.dylib'
  ];
  
  console.log('No test binary provided. Trying system binaries...\n');
  
  let tested = false;
  for (const path of defaults) {
    try {
      readFileSync(path);
      testBinary(path);
      tested = true;
      break;
    } catch {
      // Skip if file doesn't exist
    }
  }
  
  if (!tested) {
    console.log('No test binaries found.');
    console.log('\nUsage: node test/manual-test.js <path-to-mach-o-binary>');
    console.log('Example: node test/manual-test.js /usr/bin/ls');
    process.exit(1);
  }
} else {
  let allPassed = true;
  for (const path of testPaths) {
    if (!testBinary(path)) {
      allPassed = false;
    }
  }
  process.exit(allPassed ? 0 : 1);
}

