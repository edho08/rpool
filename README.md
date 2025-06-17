# ropool - Object Pooling Library

[![NPM version](https://img.shields.io/npm/v/ropool.svg?style=flat)](https://www.npmjs.com/package/ropool)
[![Tests](https://img.shields.io/github/actions/workflow/status/edho08/rpool/test.yml?branch=main&style=flat)](https://github.com/edho08/rpool/actions/workflows/test.yml)
[![Coverage Status](https://img.shields.io/coveralls/github/edho08/rpool/main.svg?style=flat)](https://coveralls.io/github/edho08/rpool?branch=main)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

A simple and efficient object pool for JavaScript and TypeScript.

`ropool` helps manage object lifecycles, reducing the overhead of frequent object creation and garbage collection, which can be beneficial for performance-sensitive applications.

## Features

*   Lightweight and efficient.
*   Typed for TypeScript.
*   Supports `Symbol.dispose` for automatic resource management with the `using` keyword.
*   Automatic resizing of the pool.
*   Handles double freeing gracefully – calling `free()` multiple times on the same handle is safe.
## Installation

```bash
npm install ropool
```

## Usage

### Basic Example

```typescript
import { ObjectPool } from 'ropool';

interface Vector2 {
  x: number;
  y: number;
}

const createVector2 = (): Vector2 => ({ x: 0, y: 0 });

// Create a pool with an initial capacity (defaults to 8 if not specified)
const vectorPool = new ObjectPool(createVector2, 10);

// Acquire an object
const handle1 = vectorPool.acquire();
const vec1 = handle1.data;
vec1.x = 10;
vec1.y = 20;
console.log('Acquired vector:', vec1);

// ... use vec1 ...

// Release the object back to the pool
handle1.free();
console.log('Vector released.');

// It's safe to call free() multiple times on the same handle
handle1.free(); // This second call will do nothing and not cause errors.
console.log('Second free() call on handle1 is safe.');


// Acquire another object (might be the same instance if it was the last one released)
const handle2 = vectorPool.acquire();
console.log('Re-acquired vector:', handle2.data); // Note: state is preserved (x:10, y:20)
handle2.free();

// Release all objects currently acquired from the pool
const h1 = vectorPool.acquire();
const h2 = vectorPool.acquire();
vectorPool.releaseAll();
console.log('All objects released.');
```

### Using `Symbol.dispose` (with `using` keyword)

If your environment supports `Symbol.dispose` (e.g., Node.js 20+, or TypeScript with appropriate `target` and `lib` settings), you can use the `using` keyword for automatic cleanup.

```typescript
import { ObjectPool } from 'ropool';

const createObj = () => ({ message: 'hello' });
const pool = new ObjectPool(createObj);

function processMessage() {
  using handle = pool.acquire(); // Object is automatically freed when 'handle' goes out of scope
  const myObj = handle.data;
  myObj.message = 'Hello from using block!';
  console.log(myObj.message);
  // No need to call handle.free() explicitly
}

processMessage();
console.log('After processMessage, object is back in the pool.');
```

## API

For detailed API documentation, please refer to the generated TypeDoc documentation at [https://edho08.github.io/rpool/](https://edho08.github.io/rpool/).

Key classes:
*   `ObjectPool<T>`: The main class for managing the pool.
*   `ObjectHandle<T>`: A wrapper around a pooled object, used to access the object and release it.

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm run test
# or for watch mode
npm run test:watch
```

### Benchmarking

```bash
npm run benchmark
```

## AI Acknowledgement 
This project was developed with the assistance of AI. AI tools were used for code generation, documentation, and general software engineering tasks to enhance productivity and explore solutions.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.