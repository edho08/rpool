import type { Suite } from 'benchmark';
import { ObjectPool, ObjectHandle } from '../src/pool'; // Adjust path as necessary

// --- Object Definitions ---

// Simple Object Type
interface SimpleObject { x: number; y: number; }
const createSimpleObject = (): SimpleObject => ({ x: 0, y: 0 });

interface ComplexObject {
    id: number;
    name: string;
    timestamp: Date;
    data: number[];
    active: boolean;
    metadata: {
        source: string;
        tags: string[];
    };
}
let complexIdCounter = 0;
const createComplexObject = (): ComplexObject => ({
    id: complexIdCounter++,
    name: "complex_object",
    timestamp: new Date(),
    data: [1, 2, 3, 4, 5],
    active: true,
    metadata: { source: "benchmark", tags: ["test", "complex"] }
});

// --- Pool Sizes ---
const POOL_SIZE_SMALL = 16;
const POOL_SIZE_MEDIUM = 1024;
const POOL_SIZE_LARGE = 10000;
const POOL_SIZE_NEAR_MAX = 65000; // Near Uint16 max

// --- Helper Functions for Benchmarks ---

function acquireAndFreeSingle<T>(pool: ObjectPool<T>): void {
    const handle = pool.acquire();
    handle.free();
}

function acquireAndFreeMany<T>(pool: ObjectPool<T>, count: number, freeOrder: 'fifo' | 'lifo' = 'lifo'): void {
    const handles: ObjectHandle<T>[] = [];
    for (let i = 0; i < count; i++) {
        handles.push(pool.acquire());
    }

    if (freeOrder === 'lifo') {
        for (let i = count - 1; i >= 0; i--) {
            handles[i].free();
        }
    } else { // fifo
        for (let i = 0; i < count; i++) {
            handles[i].free();
        }
    }
}

function acquireAndFreeInterleaved<T>(pool: ObjectPool<T>, totalAcquires: number, interleavedRatio: number = 2): void {
    const handles: ObjectHandle<T>[] = [];
    for (let i = 0; i < totalAcquires; i++) {
        const handle = pool.acquire();
        handles.push(handle);
        // Free roughly every 'interleavedRatio' objects
        if (handles.length >= interleavedRatio) {
            handles.shift()!.free();
        }
    }
    // Free any remaining handles
    handles.forEach(h => h.free());
}

function acquireAndFreeWithDispose<T>(pool: ObjectPool<T>): void {
    {
        using handle = pool.acquire();
        // handle will be freed automatically
    }
}

function acquireManyAndReleaseAll<T>(pool: ObjectPool<T>, count: number): void {
    const handles: ObjectHandle<T>[] = [];
    for (let i = 0; i < count; i++) {
        handles.push(pool.acquire());
    }
    pool.releaseAll();
}

export default function poolBenchmarkSuite(suite: Suite) {
    // --- Setup Pools for Benchmarks ---
    // Create pools with different initial sizes and object types
    const simplePoolSmall = new ObjectPool(createSimpleObject, POOL_SIZE_SMALL);
    const simplePoolMedium = new ObjectPool(createSimpleObject, POOL_SIZE_MEDIUM);
    const simplePoolLarge = new ObjectPool(createSimpleObject, POOL_SIZE_LARGE);
    const simplePoolNearMax = new ObjectPool(createSimpleObject, POOL_SIZE_NEAR_MAX);

    const complexPoolSmall = new ObjectPool(createComplexObject, POOL_SIZE_SMALL);
    const complexPoolMedium = new ObjectPool(createComplexObject, POOL_SIZE_MEDIUM);
    const complexPoolLarge = new ObjectPool(createComplexObject, POOL_SIZE_LARGE);
    const complexPoolNearMax = new ObjectPool(createComplexObject, POOL_SIZE_NEAR_MAX);

    // --- Add Benchmarks to Suite ---

    suite
        // Simple Object Pool Benchmarks
        .add(`SimplePool (Size ${POOL_SIZE_SMALL}) - Acquire/Free Single`, () => acquireAndFreeSingle(simplePoolSmall))
        .add(`SimplePool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free Single`, () => acquireAndFreeSingle(simplePoolMedium))
        .add(`SimplePool (Size ${POOL_SIZE_LARGE}) - Acquire/Free Single`, () => acquireAndFreeSingle(simplePoolLarge))
        .add(`SimplePool (Size ${POOL_SIZE_NEAR_MAX}) - Acquire/Free Single`, () => acquireAndFreeSingle(simplePoolNearMax))

        .add(`SimplePool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free ${POOL_SIZE_MEDIUM} (LIFO)`, () => acquireAndFreeMany(simplePoolMedium, POOL_SIZE_MEDIUM, 'lifo'))
        .add(`SimplePool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free ${POOL_SIZE_MEDIUM} (FIFO)`, () => acquireAndFreeMany(simplePoolMedium, POOL_SIZE_MEDIUM, 'fifo'))
        .add(`SimplePool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free ${POOL_SIZE_MEDIUM} (Interleaved)`, () => acquireAndFreeInterleaved(simplePoolMedium, POOL_SIZE_MEDIUM, 2))

        .add(`SimplePool (Size ${POOL_SIZE_MEDIUM}) - Acquire ${POOL_SIZE_MEDIUM} / ReleaseAll`, () => acquireManyAndReleaseAll(simplePoolMedium, POOL_SIZE_MEDIUM))

        // Complex Object Pool Benchmarks
        .add(`ComplexPool (Size ${POOL_SIZE_SMALL}) - Acquire/Free Single`, () => acquireAndFreeSingle(complexPoolSmall))
        .add(`ComplexPool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free Single`, () => acquireAndFreeSingle(complexPoolMedium))
        .add(`ComplexPool (Size ${POOL_SIZE_LARGE}) - Acquire/Free Single`, () => acquireAndFreeSingle(complexPoolLarge))
        .add(`ComplexPool (Size ${POOL_SIZE_NEAR_MAX}) - Acquire/Free Single`, () => acquireAndFreeSingle(complexPoolNearMax))

        .add(`ComplexPool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free ${POOL_SIZE_MEDIUM} (LIFO)`, () => acquireAndFreeMany(complexPoolMedium, POOL_SIZE_MEDIUM, 'lifo'))
        .add(`ComplexPool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free ${POOL_SIZE_MEDIUM} (FIFO)`, () => acquireAndFreeMany(complexPoolMedium, POOL_SIZE_MEDIUM, 'fifo'))
        .add(`ComplexPool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free ${POOL_SIZE_MEDIUM} (Interleaved)`, () => acquireAndFreeInterleaved(complexPoolMedium, POOL_SIZE_MEDIUM, 2))

        .add(`ComplexPool (Size ${POOL_SIZE_MEDIUM}) - Acquire ${POOL_SIZE_MEDIUM} / ReleaseAll`, () => acquireManyAndReleaseAll(complexPoolMedium, POOL_SIZE_MEDIUM))

        // Benchmarks using Symbol.dispose (using keyword) - requires Node.js 20+ or transpilation
        // Note: These might be slightly less performant due to the try/finally overhead,
        // but test the language feature integration.
        .add(`SimplePool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free using Symbol.dispose`, () => acquireAndFreeWithDispose(simplePoolMedium))
        .add(`ComplexPool (Size ${POOL_SIZE_MEDIUM}) - Acquire/Free using Symbol.dispose`, () => acquireAndFreeWithDispose(complexPoolMedium));
}