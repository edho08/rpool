/**
 * @template T The type of objects managed by the pool.
 * @class ObjectHandle
 * @description
 * A handle representing an object acquired from an {@link ObjectPool}.
 * This handle is the primary way to interact with a pooled object and release it back to the pool.
 * It provides a safe wrapper around the underlying object and prevents issues like double-freeing.
 */
export class ObjectHandle<T> {
  /**
   * The unique identifier of the object within the pool.
   * This corresponds to the index of the object in the pool's internal `objects` array.
   * @private
   * @readonly
   * @type {number}
   */
  private readonly id: number;
  /**
   * The actual object instance managed by this handle.
   * @private
   * @readonly
   * @type {T}
   */
  private readonly obj: T;
  /**
   * A reference back to the pool from which this handle was acquired.
   * @private
   * @readonly
   * @type {ObjectPool<T>}
   */
  private readonly pool: ObjectPool<T>;
  /**
   * Internal flag indicating whether the object wrapped by this handle is currently considered released
   * and available in the pool's stack.
   * @private
   * @type {boolean}
   */
  private _isReleased: boolean;

  /**
   * Creates an instance of ObjectHandle.
   * @param {number} id The unique ID of the object within the pool.
   * @param {T} obj The object instance this handle wraps.
   * @param {ObjectPool<T>} objPool The pool instance this handle belongs to.
   * @internal This constructor is intended for internal use by {@link ObjectPool}. Users should acquire handles via {@link ObjectPool#acquire}.
   */
  constructor(id: number, obj: T, objPool: ObjectPool<T>) {
    this.id = id;
    this.obj = obj;
    this.pool = objPool;
    this._isReleased = true;
  }

  /**
   * Gets the underlying object instance managed by this handle.
   * Use this getter to access and modify the pooled object's properties.
   * @returns {T} The pooled object.
   */
  get data(): T {
    return this.obj;
  }

  /**
   * Releases the object back to the pool, making it available for reuse.
   * This method is idempotent; calling it multiple times on the same handle
   * instance will only release the object once.
   * After calling `free()`, the handle should no longer be used.
   *
   * @example
   * ```typescript
   * const handle = pool.acquire();
   * // Use handle.data
   * handle.free(); // Release the object
   * handle.free(); // Calling again does nothing
   * ```
   */
  public free(): void {
    if (this._isReleased) {
      return;
    }
    this.pool.release(this.id);
    this._isReleased = true;
  }

  /**
   * Implements the Symbol.dispose method for the 'using' keyword.
   * This allows the handle to be used with the `using` declaration (available in
   * environments supporting the Explicit Resource Management proposal, e.g., Node.js 20+).
   * When a `using` declaration goes out of scope, this method is automatically called,
   * ensuring the object is released back to the pool.
   *
   * @example
   * ```typescript
   * using handle = pool.acquire();
   * // Use handle.data
   * // handle.free() is automatically called when exiting this block
   * ```
   */
  [Symbol.dispose](): void {
    this.free();
  }

  /** @internal For pool internal use to reset state on acquire. */
  public _onAcquire(): void {
    this._isReleased = false;
  }
}

/**
 * @template T The type of objects managed by the pool.
 * @class ObjectPool
 * @description
 * Manages a pool of reusable objects of type `T`.
 * This helps reduce the overhead of creating and garbage collecting objects
 * by recycling instances.
 */
export class ObjectPool<T> {
  /**
   * The factory function used to create new object instances when the pool needs to grow.
   * @private
   * @readonly
   * @type {() => T}
   */
  private readonly createObject: () => T;
  /**
   * A stack of available object IDs (indices into the `objects` array).
   * @private
   * @type {Uint16Array}
   */
  private stack: Uint16Array;
  /**
   * An array holding all object handles created by the pool.
   * The index in this array serves as the unique ID for each object/handle.
   * @private
   * @type {ObjectHandle<T>[]}
   */
  private objects: ObjectHandle<T>[];
  /**
   * The current position in the `stack` array.
   * It points to the next available ID to be acquired.
   * When `pointer` is 0, the stack is full of available IDs.
   * When `pointer` equals `stack.length`, the pool is exhausted.
   * @private
   * @type {number}
   */
  private pointer: number;
  /**
   * The initial size of the pool when first created, and also influences
   * the minimum growth size during resizing.
   * @private
   * @readonly
   * @type {number}
   */
  private readonly initialLength: number;

  /**
   * Creates an instance of ObjectPool.
   * @param {() => T} createObject A factory function that returns a new instance of the object type `T`.
   *                                This function is called when the pool needs to create new objects.
   * @param {number} [initialLength=8] The initial number of objects to create in the pool.
   *                                   If 0 is provided, the pool will default to a minimum growth size (currently 8) on the first acquire.
   * @example
   * ```typescript
   * // Create a pool for Vector2 objects with an initial size of 16
   * const vectorPool = new ObjectPool(() => ({ x: 0, y: 0 }), 16);
   *
   * // Create a pool with default initial size (8)
   * const defaultPool = new ObjectPool(() => ({ id: 0 }));
   * ```
   */
  constructor(createObject: () => T, initialLength: number = 8) {
    this.createObject = createObject;
    this.stack = new Uint16Array(0);
    this.objects = [];
    this.pointer = 0;
    this.initialLength = initialLength;
    this.resize();
  }

  /**
   * The maximum number of objects the pool can hold, limited by the capacity of `Uint16Array`.
   * This is 2^16 = 65536.
   * @static
   * @readonly
   * @type {number}
   */
  private static readonly MAX_POOL_SIZE = 65536;

  /**
   * Resizes the pool by creating new objects and adding their IDs to the stack.
   * The pool doubles in size, capped by `MAX_POOL_SIZE`.
   * If the pool is already at `MAX_POOL_SIZE`, this method does nothing.
   * @private
   * @throws {Error} If `createObject` fails during resize, although the resize logic itself prevents exceeding MAX_POOL_SIZE.
   */
  private resize(): void {
    const currentLength = this.stack.length;
    let newLength = currentLength > 0 ? currentLength * 2 : this.initialLength;

    // Ensure newLength is actually greater than current length if starting from 0 or small initialLength
    // Also cap at the maximum value a Uint16 can hold + 1 (for the length)
    if (newLength <= currentLength || newLength > ObjectPool.MAX_POOL_SIZE) {
      newLength = Math.min(
        ObjectPool.MAX_POOL_SIZE,
        currentLength + (this.initialLength > 0 ? this.initialLength : 8),
      );
    }

    // If no growth is possible or needed, return
    if (newLength <= currentLength) return;

    // Create a new Uint16Array and copy existing elements
    const newStack = new Uint16Array(newLength);
    if (currentLength > 0) {
      newStack.set(this.stack);
    }

    // Populate the new part of the stack with indices
    for (let i = currentLength; i < newLength; i++) {
      const obj = this.createObject();
      newStack[i] = i; // Store the index as the ID
      this.objects.push(new ObjectHandle(i, obj, this));
      // The new ObjectHandle's constructor sets _isReleased = true, which is correct.
    }

    this.stack = newStack;
  }

  /**
   * Acquires an object handle from the pool.
   *
   * @returns {ObjectHandle<T>} An ObjectHandle wrapping the acquired object.
   * @throws {Error} If the pool is exhausted (at `MAX_POOL_SIZE`) and cannot provide a new object.
   * @example
   * ```typescript
   * const handle = pool.acquire();
   * const obj = handle.data; // Access the object
   * ```
   */
  public acquire(): ObjectHandle<T> {
    if (this.pointer >= this.stack.length) {
      this.resize();
      if (this.pointer >= this.stack.length) {
        // This can happen if resize didn't add new objects (e.g., createObject failed, or logic error)
        throw new Error(
          'ObjectPool: Pool exhausted and resize failed to provide new objects.',
        );
      }
    }
    const id = this.stack[this.pointer];
    this.pointer++;
    const handle = this.objects[id];
    handle._onAcquire(); // Mark the handle as acquired
    return handle;
  }

  /**
   * Releases an object handle back to the pool using its ID.
   * This method is typically called internally by {@link ObjectHandle#free}.
   * It pushes the object's ID back onto the stack of available IDs.
   *
   * @param id The ID of the object handle to release.
   * @internal Intended for use by {@link ObjectHandle#free}. Direct use is discouraged.
   */
  public release(id: number): void {
    if (this.pointer > 0) {
      this.stack[--this.pointer] = id;
    } else {
      // This indicates an attempt to release when no objects are supposedly acquired,
      // or a pool imbalance.
      console.warn(
        `ObjectPool: release(id: ${id}) called when pointer is 0. Possible pool imbalance.`,
      );
    }
  }

  /**
   * Releases all acquired objects back to the pool.
   * This iterates through all objects managed by the pool, marks their handles
   * as released, and resets the internal stack and pointer so that all objects
   * are available for re-acquisition in their original order (0, 1, 2, ...).
   * Note: This does NOT reset the state of the objects themselves.
   *
   * @example
   * ```typescript
   * pool.releaseAll(); // All objects previously acquired are now available
   * ```
   */
  public releaseAll(): void {
    for (let i = 0; i < this.objects.length; i++) {
      const handle = this.objects[i];
      if (handle && !(handle as any)._isReleased) {
        (handle as any)._isReleased = true;
      }
      this.stack[i] = i;
    }
    this.pointer = 0;
  }
}
