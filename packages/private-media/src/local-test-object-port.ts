import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import {
  type PrivateObjectPort,
  PrivateObjectStorageError,
  assertPrivateObjectServer,
} from "./object-storage"

export const LOCAL_TEST_OBJECT_STORE_ID = "store_localtest"

/**
 * Registered test adapter for QA data outside production: private objects are
 * files under a local directory, so QA uploads never reach a live provider.
 */
export function createLocalTestPrivateObjectPort<ContentType extends string>(
  input: {
    rootDir?: string
    environment?: Readonly<Record<string, string | undefined>>
  } = {},
): {
  port: PrivateObjectPort<ContentType>
  configured: () => boolean
  storeId: string
} {
  assertPrivateObjectServer()
  const environment = input.environment ?? process.env
  const root = resolve(
    input.rootDir ?? join(tmpdir(), "ewatrade-local-private-objects"),
  )
  const allowed = () => environment.APP_ENV !== "production"
  const locate = (path: string) => {
    if (!allowed()) throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
    const file = resolve(root, path)
    if (!file.startsWith(`${root}${sep}`))
      throw new PrivateObjectStorageError("INVALID_OBJECT")
    return file
  }
  const port: PrivateObjectPort<ContentType> = {
    async put(path, bytes, options) {
      options.abortSignal.throwIfAborted()
      const file = locate(path)
      await mkdir(dirname(file), { recursive: true })
      try {
        // "wx" refuses to overwrite, like the live port's allowOverwrite: false.
        await writeFile(file, bytes, { flag: "wx" })
        await writeFile(`${file}.type`, options.contentType, { flag: "w" })
      } catch {
        throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      }
    },
    async get(path, options) {
      options.abortSignal.throwIfAborted()
      const file = locate(path)
      let bytes: Uint8Array
      let contentType: string
      try {
        bytes = new Uint8Array(await readFile(file))
        contentType = (await readFile(`${file}.type`, "utf8")).trim()
      } catch {
        return null
      }
      return {
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
        contentType,
        sizeBytes: bytes.byteLength,
      }
    },
    async delete(path) {
      const file = locate(path)
      await rm(file, { force: true })
      await rm(`${file}.type`, { force: true })
    },
  }
  return { port, configured: allowed, storeId: LOCAL_TEST_OBJECT_STORE_ID }
}
