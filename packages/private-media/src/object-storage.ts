import { createHash } from "node:crypto"

export type PrivateObjectPort<ContentType extends string = string> = {
  delete?(path: string, options: { abortSignal: AbortSignal }): Promise<void>
  put(
    path: string,
    bytes: Uint8Array,
    options: {
      access: "private"
      abortSignal: AbortSignal
      addRandomSuffix: false
      allowOverwrite: false
      cacheControlMaxAge: 60
      contentType: ContentType
    },
  ): Promise<void>
  get(
    path: string,
    options: {
      access: "private"
      abortSignal: AbortSignal
      useCache: false
    },
  ): Promise<{
    stream: ReadableStream<Uint8Array>
    contentType: string | null
    sizeBytes: number | null
  } | null>
}

export type PrivateObjectDescriptor<ContentType extends string = string> = {
  storagePath: string
  contentDigest: string
  contentType: ContentType
  sizeBytes: number
}

export type PrivateObjectStorageErrorCode =
  | "INVALID_OBJECT"
  | "OBJECT_NOT_FOUND"
  | "INTEGRITY_MISMATCH"
  | "STORAGE_UNAVAILABLE"

const messages: Record<PrivateObjectStorageErrorCode, string> = {
  INVALID_OBJECT: "Invalid private object identity or content.",
  OBJECT_NOT_FOUND: "Private object not found.",
  INTEGRITY_MISMATCH: "The original private object could not be verified.",
  STORAGE_UNAVAILABLE:
    "Private storage is unavailable. Retry the same original object.",
}

/** Errors never retain provider exception text, URLs, credentials or causes. */
export class PrivateObjectStorageError extends Error {
  constructor(readonly code: PrivateObjectStorageErrorCode) {
    super(messages[code])
    this.name = "PrivateObjectStorageError"
  }
}

export function assertPrivateObjectServer() {
  if (typeof window !== "undefined")
    throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
}

export function privateObjectDigest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function privateObjectOperationSignal(callerSignal?: AbortSignal) {
  const deadline = AbortSignal.timeout(30_000)
  return callerSignal ? AbortSignal.any([deadline, callerSignal]) : deadline
}

function failure(error: unknown): never {
  throw new PrivateObjectStorageError(
    error instanceof PrivateObjectStorageError
      ? error.code
      : "STORAGE_UNAVAILABLE",
  )
}

function cancel(stream: ReadableStream<Uint8Array>) {
  void stream.cancel().catch(() => undefined)
}

/** Also bounds ports that ignore their signal; late reads are canceled. */
async function operation<T>(
  run: () => Promise<T>,
  signal: AbortSignal,
  late?: (result: T) => void,
): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    let aborted = false
    const abort = () => {
      aborted = true
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted()
        return run()
      })
      .then(
        (result) => {
          signal.removeEventListener("abort", abort)
          if (aborted) late?.(result)
          else resolve(result)
        },
        (error) => {
          signal.removeEventListener("abort", abort)
          reject(error)
        },
      )
  })
}

/** Byte integrity only. Domain callers must authorize and canonicalize the key. */
export function createPrivateObjectStorage<ContentType extends string>(input: {
  port: PrivateObjectPort<ContentType>
  configured: () => boolean
  maxBytes: number
  validateBytes: (bytes: Uint8Array, contentType: ContentType) => void
}) {
  assertPrivateObjectServer()
  if (
    !Number.isSafeInteger(input.maxBytes) ||
    input.maxBytes < 1 ||
    input.maxBytes > 10 * 1024 * 1024
  )
    throw new PrivateObjectStorageError("INVALID_OBJECT")

  function available() {
    assertPrivateObjectServer()
    if (!input.configured())
      throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
  }
  function descriptor(value: PrivateObjectDescriptor<ContentType>) {
    available()
    const target = { ...value }
    const segments = target.storagePath.split("/")
    if (
      target.storagePath.length > 1_024 ||
      !/^[a-zA-Z0-9_./-]+$/.test(target.storagePath) ||
      segments.some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/.test(target.contentDigest) ||
      !Number.isSafeInteger(target.sizeBytes) ||
      target.sizeBytes < 1 ||
      target.sizeBytes > input.maxBytes ||
      !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(target.contentType)
    )
      throw new PrivateObjectStorageError("INVALID_OBJECT")
    return target
  }

  async function verified(
    target: PrivateObjectDescriptor<ContentType>,
    signal: AbortSignal,
  ) {
    const response = await operation(
      () =>
        input.port.get(target.storagePath, {
          access: "private",
          useCache: false,
          abortSignal: signal,
        }),
      signal,
      (late) => {
        if (late) cancel(late.stream)
      },
    )
    if (!response) throw new PrivateObjectStorageError("OBJECT_NOT_FOUND")
    const reader = response.stream.getReader()
    try {
      signal.throwIfAborted()
      if (
        response.contentType !== target.contentType ||
        response.sizeBytes !== target.sizeBytes
      )
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      const bytes = new Uint8Array(target.sizeBytes)
      let offset = 0
      let chunks = 0
      while (true) {
        const result = await operation(() => reader.read(), signal)
        signal.throwIfAborted()
        if (result.done) break
        if (
          !result.value.byteLength ||
          ++chunks > 65_536 ||
          offset + result.value.byteLength > target.sizeBytes
        )
          throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
        bytes.set(result.value, offset)
        offset += result.value.byteLength
      }
      if (
        offset !== target.sizeBytes ||
        privateObjectDigest(bytes) !== target.contentDigest
      )
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      input.validateBytes(bytes, target.contentType)
      return bytes
    } finally {
      void reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  return {
    assertAvailable: available,
    async write(request: {
      object: PrivateObjectDescriptor<ContentType>
      bytes: Uint8Array
      abortSignal?: AbortSignal
    }) {
      const target = descriptor(request.object)
      if (request.bytes.byteLength !== target.sizeBytes)
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      const bytes = request.bytes.slice()
      if (privateObjectDigest(bytes) !== target.contentDigest)
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      input.validateBytes(bytes, target.contentType)
      const signal = privateObjectOperationSignal(request.abortSignal)
      try {
        await operation(
          () =>
            input.port.put(target.storagePath, bytes, {
              access: "private",
              addRandomSuffix: false,
              allowOverwrite: false,
              cacheControlMaxAge: 60,
              contentType: target.contentType,
              abortSignal: signal,
            }),
          signal,
        )
      } catch (error) {
        try {
          await verified(target, signal)
          return
        } catch (readError) {
          if (
            readError instanceof PrivateObjectStorageError &&
            readError.code === "INTEGRITY_MISMATCH"
          )
            throw readError
        }
        failure(error)
      }
    },
    async read(request: {
      object: PrivateObjectDescriptor<ContentType>
      abortSignal?: AbortSignal
    }) {
      const target = descriptor(request.object)
      try {
        return await verified(
          target,
          privateObjectOperationSignal(request.abortSignal),
        )
      } catch (error) {
        failure(error)
      }
    },
    async remove(request: {
      object: PrivateObjectDescriptor<ContentType>
      abortSignal?: AbortSignal
    }) {
      const target = descriptor(request.object)
      const remove = input.port.delete
      if (!remove) throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      const signal = privateObjectOperationSignal(request.abortSignal)
      try {
        await operation(
          () =>
            remove.call(input.port, target.storagePath, {
              abortSignal: signal,
            }),
          signal,
        )
      } catch (error) {
        failure(error)
      }
    },
  }
}
