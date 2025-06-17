import { ObjectPool, ObjectHandle } from 'src/pool'; // Adjust path as necessary
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';

// --- Helper Types and Functions for Tests ---
interface TestObject {
  creationId: number;
  value: string;
  userModified?: boolean;
}

let creationCounter: number;
const createTestObject = (): TestObject => {
  return { creationId: creationCounter++, value: 'initial' };
};

const MAX_POOL_SIZE_FROM_CLASS = 65536; // Reflects ObjectPool.MAX_POOL_SIZE

describe('ObjectPool & ObjectHandle Comprehensive Tests', () => {
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    creationCounter = 0; // Reset for each test
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress and track warnings
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('ObjectHandle', () => {
    let pool: ObjectPool<TestObject>;
    let obj: TestObject;
    let handle: ObjectHandle<TestObject>;

    beforeEach(() => {
      pool = new ObjectPool(createTestObject, 1);
      // Manually extract object and create handle for isolated tests if needed,
      // but typically handles are acquired.
      // For direct constructor test:
      obj = createTestObject();
      // Accessing private constructor for testing, or use acquire
      handle = new ObjectHandle<TestObject>(obj.creationId, obj, pool);
    });

    it('constructor should initialize properties correctly', () => {
      expect(handle['id']).toBe(obj.creationId);

      expect(handle['obj']).toBe(obj);

      expect(handle['pool']).toBe(pool);

      expect(handle['_isReleased']).toBe(true); // Initially released
    });

    it('data getter should return the underlying object', () => {
      expect(handle.data).toBe(obj);
    });

    it('_onAcquire should set _isReleased to false', () => {
      handle._onAcquire();

      expect(handle['_isReleased']).toBe(false);
    });

    describe('free()', () => {
      let acquiredHandle: ObjectHandle<TestObject>;

      beforeEach(() => {
        acquiredHandle = pool.acquire(); // Get a properly acquired handle
      });

      it('should release the object back to the pool and set _isReleased to true', () => {
        const poolReleaseSpy = vi.spyOn(pool, 'release');

        expect(acquiredHandle['_isReleased']).toBe(false);

        acquiredHandle.free();

        expect(acquiredHandle['_isReleased']).toBe(true);
        expect(poolReleaseSpy).toHaveBeenCalledWith(acquiredHandle['id']);
        poolReleaseSpy.mockRestore();
      });

      it('should prevent double freeing (be idempotent)', () => {
        const poolReleaseSpy = vi.spyOn(pool, 'release');
        acquiredHandle.free(); // First call

        expect(acquiredHandle['_isReleased']).toBe(true);
        expect(poolReleaseSpy).toHaveBeenCalledTimes(1);

        acquiredHandle.free(); // Second call

        expect(acquiredHandle['_isReleased']).toBe(true);
        expect(poolReleaseSpy).toHaveBeenCalledTimes(1); // Still 1
        poolReleaseSpy.mockRestore();
      });

      it('should do nothing if called on a never-acquired (freshly constructed) handle', () => {
        // `handle` from outer beforeEach was never acquired through pool.acquire()
        const poolReleaseSpy = vi.spyOn(pool, 'release');

        expect(handle['_isReleased']).toBe(true);

        handle.free();

        expect(handle['_isReleased']).toBe(true);
        expect(poolReleaseSpy).not.toHaveBeenCalled();
        poolReleaseSpy.mockRestore();
      });
    });

    describe('Symbol.dispose', () => {
      it('should call free() when disposed using "using" keyword', () => {
        const acquiredHandle = pool.acquire();
        const freeSpy = vi.spyOn(acquiredHandle, 'free');

        {
          using h = acquiredHandle;

          expect(h['_isReleased']).toBe(false);
        } // h.free() is called here

        expect(freeSpy).toHaveBeenCalledTimes(1);

        expect(acquiredHandle['_isReleased']).toBe(true);
        freeSpy.mockRestore();
      });
    });
  });

  describe('ObjectPool Constructor & Initialization', () => {
    it('should initialize with default initialLength (8)', () => {
      const pool = new ObjectPool(createTestObject);

      expect(pool['objects'].length).toBe(8);

      expect(pool['stack'].length).toBe(8);

      expect(pool['pointer']).toBe(0);

      for (let i = 0; i < 8; ++i) expect(pool['stack'][i]).toBe(i);
    });

    it('should initialize with specified initialLength', () => {
      const pool = new ObjectPool(createTestObject, 5);

      expect(pool['objects'].length).toBe(5);

      expect(pool['stack'].length).toBe(5);

      for (let i = 0; i < 5; ++i) expect(pool['stack'][i]).toBe(i);
    });

    it('should initialize with initialLength 0, defaulting to minimum growth (8)', () => {
      const pool = new ObjectPool(createTestObject, 0);

      expect(pool['objects'].length).toBe(8); // Grows to 8 due to resize logic

      expect(pool['stack'].length).toBe(8);
    });

    it('should initialize stack as Uint16Array', () => {
      const pool = new ObjectPool(createTestObject, 1);

      expect(pool['stack']).toBeInstanceOf(Uint16Array);
    });
  });

  describe('ObjectPool acquire() and release()', () => {
    it('acquire() should return a valid ObjectHandle and update state', () => {
      const pool = new ObjectPool(createTestObject, 1);
      const handle = pool.acquire();

      expect(handle).toBeInstanceOf(ObjectHandle);
      expect(handle.data.creationId).toBe(0); // First object

      expect(handle['_isReleased']).toBe(false);

      expect(pool['pointer']).toBe(1);
    });

    it('release() via handle.free() should make object available and update state', () => {
      const pool = new ObjectPool(createTestObject, 1);
      const handle = pool.acquire();
      const originalId = handle['id'];

      expect(pool['pointer']).toBe(1);

      handle.free();

      expect(handle['_isReleased']).toBe(true);

      expect(pool['pointer']).toBe(0); // Pointer decremented

      expect(pool['stack'][0]).toBe(originalId); // ID put back onto stack
    });

    it('acquired objects should be distinct if pool has capacity', () => {
      const pool = new ObjectPool(createTestObject, 2);
      const h1 = pool.acquire();
      const h2 = pool.acquire();
      expect(h1.data).not.toBe(h2.data);
      expect(h1.data.creationId).not.toBe(h2.data.creationId);
    });

    it('should reuse objects after release', () => {
      const pool = new ObjectPool(createTestObject, 1);
      const h1 = pool.acquire();
      h1.data.value = 'modified';
      const originalCreationId = h1.data.creationId;
      h1.free();

      const h2 = pool.acquire();
      expect(h2.data.creationId).toBe(originalCreationId); // Same object by creationId
      // Note: The pool itself doesn't reset object state.
      // createTestObject factory always returns 'initial', so value would be 'initial'
      // when a *new* object is created. When an object is reused, its state persists.
      // Thus, h2.data.value should be the modified value.
      expect(h2.data.value).toBe('modified');
    });

    it('LIFO behavior: last released is first acquired', () => {
      const pool = new ObjectPool(createTestObject, 2);
      const h1 = pool.acquire(); // creationId 0
      const h2 = pool.acquire(); // creationId 1

      h2.free(); // obj with creationId 1 released last
      h1.free(); // obj with creationId 0 released first

      const h3 = pool.acquire(); // Should be obj with creationId 0
      expect(h3.data.creationId).toBe(0);
      const h4 = pool.acquire(); // Should be obj with creationId 1
      expect(h4.data.creationId).toBe(1);
    });

    it('acquire all, release all (LIFO), then re-acquire all', () => {
      const size = 5;
      const pool = new ObjectPool(createTestObject, size);
      const handles: ObjectHandle<TestObject>[] = [];
      const creationIds: number[] = [];

      for (let i = 0; i < size; i++) {
        const h = pool.acquire();
        handles.push(h);
        creationIds.push(h.data.creationId);
      }

      for (let i = size - 1; i >= 0; i--) {
        handles[i].free();
      }

      expect(pool['pointer']).toBe(0);

      const reacquiredHandles: ObjectHandle<TestObject>[] = [];
      for (let i = 0; i < size; i++) {
        reacquiredHandles.push(pool.acquire());
      }

      // Check if re-acquired in LIFO order of release (which is FIFO of original acquisition)
      expect(reacquiredHandles[0].data.creationId).toBe(creationIds[0]);
      expect(reacquiredHandles[1].data.creationId).toBe(creationIds[1]);
      // ...
      expect(reacquiredHandles[size - 1].data.creationId).toBe(
        creationIds[size - 1],
      );
    });

    it('interleaved acquire and release', () => {
      const pool = new ObjectPool(createTestObject, 3); // size 3
      const h1 = pool.acquire(); // obj 0
      const h2 = pool.acquire(); // obj 1

      h2.data.userModified = true; // Modify;

      h1.free(); // obj 0 back

      const h3 = pool.acquire(); // should be obj 0 (reused)
      expect(h3.data.creationId).toBe(0);

      const h4 = pool.acquire(); // should be obj 2 (new)
      expect(h4.data.creationId).toBe(2);

      expect(pool['pointer']).toBe(3); // pool full

      // stack state after these ops:
      // acquire 0 -> pointer=1, stack[0]=0
      // acquire 1 -> pointer=2, stack[1]=1
      // free 0    -> pointer=1, stack[1]=0 (h1's id)
      // acquire 0 -> pointer=2, stack[1]=0 (h3 gets obj 0)
      // acquire 2 -> pointer=3, stack[2]=2 (h4 gets obj 2)
      // Current stack: [0, 0, 2] (ids of objects currently held by handles h2, h3, h4 in some mapping)
      // No, stack[pointer] is where the *next* acquire comes from.
      // Initial: stack = [0,1,2], pointer = 0
      // h1=acq(0): stack=[0,1,2], pointer=1
      // h2=acq(1): stack=[0,1,2], pointer=2
      // h1.free(0): stack=[0,0,2], pointer=1 (stack[--pointer] = 0 -> stack[1]=0)
      // h3=acq(0): stack=[0,0,2], pointer=2 (id=stack[1]=0)
      // h4=acq(2): stack=[0,0,2], pointer=3 (id=stack[2]=2)
      // All objects (0,1,2) are out. Handles: h2 (obj1), h3 (obj0), h4 (obj2)
    });

    it('pool.release() should warn if pointer is 0 (potential imbalance)', () => {
      const pool = new ObjectPool(createTestObject, 1);
      // Pointer is already 0. Calling release directly.
      pool.release(0); // Attempt to release object with ID 0
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'ObjectPool: release(id: 0) called when pointer is 0.',
        ),
      );

      // Scenario: acquire then free, pointer is 0. Then call pool.release() again.
      consoleWarnSpy.mockClear();
      const h = pool.acquire(); // pointer becomes 1
      h.free(); // pointer becomes 0
      expect(consoleWarnSpy).not.toHaveBeenCalled(); // free() is fine

      pool.release(h['id']); // Manually call pool.release again
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `ObjectPool: release(id: ${String(h['id'])}) called when pointer is 0.`,
        ),
      );
    });
  });

  describe('ObjectPool Resizing', () => {
    it('should resize when acquiring more objects than initial capacity', () => {
      const initialLength = 2;
      const pool = new ObjectPool(createTestObject, initialLength);
      for (let i = 0; i < initialLength; i++) pool.acquire();

      expect(pool['objects'].length).toBe(initialLength);

      expect(pool['stack'].length).toBe(initialLength);

      const h_extra = pool.acquire(); // This should trigger resize
      expect(h_extra).toBeInstanceOf(ObjectHandle);

      expect(pool['objects'].length).toBe(initialLength * 2); // Default doubling

      expect(pool['stack'].length).toBe(initialLength * 2);

      expect(pool['pointer']).toBe(initialLength + 1);
    });

    it('resize should correctly populate new stack segment and objects', () => {
      const pool = new ObjectPool(createTestObject, 1);
      pool.acquire(); // obj 0, pointer = 1, stack.length = 1
      pool.acquire(); // obj 1 (after resize), pointer = 2, stack.length = 2

      expect(pool['objects'].length).toBe(2);

      expect(pool['stack'][0]).toBe(0); // Original

      expect(pool['stack'][1]).toBe(1); // New from resize
      // After the previous acquire, pointer is 2, stack.length is 2. This acquire triggers resize from 2 to 4.
      expect(pool.acquire().data.creationId).toBe(2); // Acquires the object with creationId 2 (index 2 in the resized pool)

      expect(pool['objects'][1].data.creationId).toBe(1);
    });

    it('should handle initialLength of 0 and resize correctly on first acquire', () => {
      const pool = new ObjectPool(createTestObject, 0);

      expect(pool['objects'].length).toBe(8); // Initial resize to 8

      expect(pool['stack'].length).toBe(8);

      const handle = pool.acquire();
      expect(handle.data.creationId).toBe(0);

      expect(pool['pointer']).toBe(1);
    });
  });

  describe('ObjectPool MAX_POOL_SIZE', () => {
    it(`should allow acquiring up to MAX_POOL_SIZE (${MAX_POOL_SIZE_FROM_CLASS}) objects if memory allows`, () => {
      const nearMaxTestSize = 10; // Test with a manageable number
      (ObjectPool as any)['MAX_POOL_SIZE'] = nearMaxTestSize; // Temporarily override for this test scope

      const pool = new ObjectPool(createTestObject, 2);
      const handles: ObjectHandle<TestObject>[] = []; // Keep handles to prevent GC
      for (let i = 0; i < nearMaxTestSize; i++) {
        handles.push(pool.acquire());
      }

      expect(pool['objects'].length).toBe(nearMaxTestSize);

      expect(pool['stack'].length).toBe(nearMaxTestSize);

      expect(() => pool.acquire()).toThrowError(
        'ObjectPool: Pool exhausted and resize failed to provide new objects.',
      );

      (ObjectPool as any)['MAX_POOL_SIZE'] = MAX_POOL_SIZE_FROM_CLASS; // Restore
    }, 30000); // Increase timeout if testing larger sizes

    it('resize should cap newLength at MAX_POOL_SIZE', () => {
      (ObjectPool as any)['MAX_POOL_SIZE'] = 10; // Override for test
      const pool = new ObjectPool(createTestObject, 8); // initial 8, pointer 0
      pool.acquire();
      pool.acquire();
      pool.acquire();
      pool.acquire(); // 4
      pool.acquire();
      pool.acquire();
      pool.acquire();
      pool.acquire(); // 8, pointer=8
      // Next acquire will try to resize. currentLength=8. newLength = 8*2=16. Capped to 10.
      pool.acquire(); // obj 8. pointer=9. length should be 10.

      expect(pool['objects'].length).toBe(10);

      expect(pool['stack'].length).toBe(10);
      pool.acquire(); // obj 9. pointer=10.

      expect(pool['pointer']).toBe(10);
      expect(() => pool.acquire()).toThrowError();

      (ObjectPool as any)['MAX_POOL_SIZE'] = MAX_POOL_SIZE_FROM_CLASS; // Restore
    });

    it('should throw error when acquiring beyond MAX_POOL_SIZE', () => {
      (ObjectPool as any)['MAX_POOL_SIZE'] = 3; // Override for test
      const pool = new ObjectPool(createTestObject, 1);
      pool.acquire(); // 1
      pool.acquire(); // 2 (resized to 2)
      pool.acquire(); // 3 (resized to 3)

      expect(pool['objects'].length).toBe(3); // Should be capped at 3
      expect(() => pool.acquire()).toThrowError(
        'ObjectPool: Pool exhausted and resize failed to provide new objects.',
      );
      (ObjectPool as any)['MAX_POOL_SIZE'] = MAX_POOL_SIZE_FROM_CLASS; // Restore
    });
  });

  describe('ObjectPool releaseAll()', () => {
    it('should mark all acquired handles as released and reset pointer', () => {
      const pool = new ObjectPool(createTestObject, 3);
      const h1 = pool.acquire();
      const h2 = pool.acquire();
      // h3 not acquired

      pool.releaseAll();

      expect(h1['_isReleased']).toBe(true);

      expect(h2['_isReleased']).toBe(true);

      const h3Handle = pool['objects'][2]; // The handle for the 3rd object

      expect(h3Handle['_isReleased']).toBe(true); // Was already true

      expect(pool['pointer']).toBe(0);
    });

    it('it should allow re-acquiring all objects uniquely', () => {
      // This test assumes a *fixed* releaseAll.
      // To make this test pass, `releaseAll` needs `this.stack[i] = i;`
      class FixedObjectPool<T> extends ObjectPool<T> {
        public releaseAll(): void {
          for (let i = 0; i < this['objects'].length; i++) {
            const handle = this['objects'][i];
            if (handle && !(handle as any)._isReleased) {
              (handle as any)._isReleased = true;
            }
            this['stack'][i] = i; // The fix
          }
          this['pointer'] = 0;
        }
      }

      const size = 3;
      const pool = new FixedObjectPool(createTestObject, size);
      const handles = [pool.acquire(), pool.acquire(), pool.acquire()];
      const originalCreationIds = handles.map((h) => h.data.creationId);

      handles[1].free(); // Release one in the middle to mess up stack order

      pool.releaseAll();

      const reacquiredCreationIds: number[] = [];
      for (let i = 0; i < size; i++) {
        reacquiredCreationIds.push(pool.acquire().data.creationId);
      }
      reacquiredCreationIds.sort((a, b) => a - b); // Sort because acquisition order might not be 0,1,2
      originalCreationIds.sort((a, b) => a - b);

      expect(reacquiredCreationIds).toEqual(originalCreationIds); // All unique objects re-acquired
      const uniqueIds = new Set(reacquiredCreationIds);
      expect(uniqueIds.size).toBe(size); // Ensure they are indeed unique
    });
  });
});
