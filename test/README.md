This directory contains test files for the libjsmacho library.

## Running Tests

### Basic Tests
Basic unit tests that don't require external binaries:
```bash
node --test test/test-basic.js
```

### Integration Tests
Integration tests that work with real Mach-O binaries (requires macOS or test binaries):
```bash
node --test test/test-integration.js
```

### Run All Tests
```bash
npm test
```

## Test Requirements

### Node.js Version
Requires Node.js 18+ (for built-in test runner).

### Test Binaries (Optional)
The integration tests will automatically use system binaries if available on macOS:
- `/usr/bin/ls`
- `/usr/bin/cat`
- `/usr/lib/libSystem.B.dylib` (for fat binary tests)

### Creating Test Binaries

#### On macOS:
1. Use existing system binaries (as listed above)
2. Create a simple test binary:
   ```bash
   echo 'int main(){return 0;}' | gcc -x c - -o test_binary
   ```
3. Create a fat binary:
   ```bash
   lipo -create binary1 binary2 -output fat_binary
   ```

#### Without macOS:
You'll need to obtain Mach-O binaries from a macOS system or use virtual machines/containers.

## What Gets Tested

### Basic Tests (`test-basic.js`)
- Constructor validation
- Header parsing
- UUID setting and validation
- Segment injection validation
- Basic build/roundtrip functionality

### Integration Tests (`test-integration.js`)
- Parsing real Mach-O binaries
- Roundtrip parsing and rebuilding
- UUID modification
- Code signature stripping
- Fat binary handling

## Key Test Scenarios for Our Fixes

1. **Build Pipeline**: Tests that `build()` properly serializes modified load commands
2. **Mutation APIs**: Tests that UUID, segment injection work correctly
3. **Fat Binaries**: Tests CIGAM handling and proper slice alignment
4. **Bounds Checking**: Tests error handling for malformed binaries

## Adding More Tests

To add tests, edit the test files and add new test cases using Node's built-in test API:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('My test name', () => {
  // Your test code
  assert.strictEqual(actual, expected);
});
```

