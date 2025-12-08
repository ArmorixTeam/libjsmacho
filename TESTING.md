# Testing Guide for libjsmacho

This guide explains how to test the changes made to libjsmacho.

## Quick Start

### Run Basic Tests (No Binaries Required)
```bash
npm run test:basic
# or
node --test test/test-basic.js
```

These tests use synthetic Mach-O headers and don't require actual binary files.

### Run Integration Tests (Requires Mach-O Binaries)
```bash
npm run test:integration
# or
node --test test/test-integration.js
```

These tests will automatically use system binaries on macOS if available.

### Run All Tests
```bash
npm test
```

### Manual Testing Script
For quick verification with a specific binary:
```bash
node test/manual-test.js /path/to/binary
```

On macOS, you can test with system binaries:
```bash
node test/manual-test.js /usr/bin/ls
node test/manual-test.js /usr/lib/libSystem.B.dylib  # Fat binary
```

## What Gets Tested

### ✅ Build Pipeline Fixes
- **Issue**: `build()` was just copying original slice, ignoring modifications
- **Test**: Modifications (UUID, segments) are verified to persist after `build()`
- **Files**: `test/test-basic.js`, `test/test-integration.js`

### ✅ Mutation API Fixes
- **setUUID()**: Validates UUID format, properly updates command data
- **injectSegment()**: Validates inputs, calculates proper offsets
- **addPlaceholderCodeSignature()**: Sets correct data offsets
- **Test**: All mutation methods are tested with validation

### ✅ Fat Binary Handling
- **CIGAM Support**: Little-endian fat binaries are now parsed correctly
- **Bounds Checking**: Added validation for slice extraction
- **Alignment**: Slices are properly aligned when rebuilding
- **Test**: Fat binary parsing, slice selection, and rebuilding

### ✅ Bounds Checking
- Load command parsing validates sizes and boundaries
- Fat binary parsing validates slice offsets
- **Test**: Error cases are tested (truncated files, invalid sizes)

## Testing Without macOS

If you're not on macOS, you have several options:

### Option 1: Use Docker/VM
Run macOS in a virtual machine or use a macOS Docker container to access test binaries.

### Option 2: Obtain Test Binaries
1. Get Mach-O binaries from a macOS system
2. Save them locally
3. Use the manual test script:
   ```bash
   node test/manual-test.js ./test-binaries/my-binary
   ```

### Option 3: Create Minimal Test Binaries
On macOS, you can create simple test binaries:
```bash
# Create a simple executable
echo 'int main(){return 0;}' | gcc -x c - -o test_binary

# Create a fat binary (requires multiple architectures)
lipo -create binary1 binary2 -output fat_binary
```

## Test Structure

```
test/
├── test-basic.js          # Unit tests with synthetic data
├── test-integration.js    # Integration tests with real binaries
├── manual-test.js         # Interactive test script
└── README.md              # Detailed test documentation
```

## Key Test Scenarios

### 1. Roundtrip Parsing
```javascript
const macho = new MachOFile(buffer);
const rebuilt = macho.build();
const macho2 = new MachOFile(rebuilt);
// Verify header and structure match
```

### 2. Modification Persistence
```javascript
const macho = new MachOFile(buffer);
macho.setUUID('12345678-1234-1234-1234-123456789abc');
const rebuilt = macho.build();
const macho2 = new MachOFile(rebuilt);
// Verify UUID command exists in rebuilt binary
```

### 3. Code Signature Stripping
```javascript
const macho = new MachOFile(buffer);
const hadSig = macho.findCodeSignature() !== null;
macho.stripCodeSignature();
const rebuilt = macho.build();
const macho2 = new MachOFile(rebuilt);
// Verify signature is absent after rebuild
```

### 4. Fat Binary Handling
```javascript
const macho = new MachOFile(fatBinary);
if (macho.isFat()) {
  const slices = macho.getSlices();
  macho.selectSlice(0);
  const rebuilt = macho.build();
  // Verify rebuilt fat binary is valid
}
```

## Expected Results

When tests pass, you should see:
- ✅ All basic unit tests passing
- ✅ Integration tests passing (if binaries available)
- ✅ Manual test script showing all checkmarks
- ✅ No errors or exceptions

## Troubleshooting

### "Unsupported buffer input" Error
- Make sure you're passing `ArrayBuffer`, `Uint8Array`, or a valid buffer type
- Check that the file was read correctly

### "Not a Mach-O header" Error
- Verify the file is a valid Mach-O binary
- Check that the file wasn't corrupted during transfer

### "Fat binary too small" or Bounds Errors
- The bounds checking is working correctly
- The binary may be corrupted or truncated
- Verify the file is complete

### Tests Skip with "No test binaries found"
- This is expected if you're not on macOS
- Use the manual test script with a specific binary path
- Or set up test binaries as described above

## Continuous Integration

For CI/CD pipelines, you can:
1. Include test binaries in the repository (if license permits)
2. Download test binaries during CI setup
3. Use Docker containers with macOS for testing
4. Focus on basic tests that don't require binaries

## Next Steps

After running tests:
1. Review any failing tests
2. Check console output for detailed error messages
3. Verify the fixes address the reported issues
4. Consider adding more edge case tests

## Questions?

Refer to:
- `test/README.md` for detailed test documentation
- Individual test files for test implementation details
- Source code comments for implementation details

