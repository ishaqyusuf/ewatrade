import { expect, mock, test } from "bun:test"

let allowed = true
let failWrite = false
const events: string[] = []
let saverAvailable = false
let afterWrite = () => undefined
let afterPermission = () => undefined
let lastUti: string | undefined
mock.module("react-native", () => ({ Platform: { OS: "android" } }))
mock.module("expo", () => ({
  requireOptionalNativeModule: () => ({
    isSupported: () => saverAvailable,
    saveToDownloads: async (
      _uri: string,
      name: string,
      _mime: string,
      folder: string,
    ) => {
      events.push(`downloads:${folder}/${name}`)
      return { folder: `Download/${folder}`, name, uri: "content://dl/1" }
    },
  }),
}))
mock.module("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///receipt-test/",
  EncodingType: { Base64: "base64" },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: async () => {
      afterPermission()
      return {
        granted: allowed,
        directoryUri: "content://folder",
      }
    },
    createFileAsync: async () => {
      events.push("create")
      return "content://new-file"
    },
  },
  makeDirectoryAsync: async () => {
    events.push("directory")
  },
  writeAsStringAsync: async () => {
    events.push("write")
    if (failWrite) throw new Error("Disk full")
    afterWrite()
  },
  deleteAsync: async () => {
    events.push("cleanup")
  },
}))
mock.module("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: async (_uri: string, options: { UTI?: string }) => {
    lastUti = options.UTI
    events.push("share")
  },
}))
const { deliverReceiptFile } = await import("./receipt-file")
const file = {
  bytes: new Uint8Array([1, 2, 3]),
  filename: "receipt.pdf",
  mimeType: "application/pdf",
}

test("Android folder cancellation creates no file", async () => {
  events.length = 0
  allowed = false
  expect(await deliverReceiptFile(file, "save")).toBe("Save cancelled.")
  expect(events).toEqual([])
  allowed = true
})
test("failed Android writes remove only the newly created incomplete file", async () => {
  events.length = 0
  failWrite = true
  await expect(deliverReceiptFile(file, "save")).rejects.toThrow("Disk full")
  expect(events).toEqual(["create", "write", "cleanup"])
  failWrite = false
})
test("sharing receives a real file and cleans the temporary directory afterward", async () => {
  events.length = 0
  await deliverReceiptFile(file, "share")
  expect(events).toEqual(["directory", "write", "share", "cleanup"])
})
test("Android 10+ saves straight to Downloads without a folder prompt", async () => {
  events.length = 0
  saverAvailable = true
  expect(await deliverReceiptFile(file, "save")).toBe(
    "Saved to Download/EwaTrade as receipt.pdf",
  )
  expect(events).toEqual([
    "directory",
    "write",
    "downloads:EwaTrade/receipt.pdf",
    "cleanup",
  ])
  saverAvailable = false
})
test("scope retired in a folder prompt creates no file", async () => {
  events.length = 0
  let valid = true
  afterPermission = () => {
    valid = false
  }
  try {
    await expect(
      deliverReceiptFile(file, "save", () => {
        if (!valid) throw new Error("retired")
      }),
    ).rejects.toThrow("retired")
    expect(events).toEqual([])
  } finally {
    afterPermission = () => undefined
  }
})
test("scope retired during cache write cannot export and its temporary bytes are cleaned", async () => {
  for (const action of ["save", "share"] as const) {
    events.length = 0
    let valid = true
    saverAvailable = true
    afterWrite = () => {
      valid = false
    }
    try {
      await expect(
        deliverReceiptFile(file, action, () => {
          if (!valid) throw new Error("retired")
        }),
      ).rejects.toThrow("retired")
      expect(events).toEqual(["directory", "write", "cleanup"])
    } finally {
      afterWrite = () => undefined
      saverAvailable = false
    }
  }
})
test("original images use their image UTI instead of the Order ZIP type", async () => {
  await deliverReceiptFile(
    { ...file, filename: "receipt.heic", mimeType: "image/heic" },
    "share",
  )
  expect(lastUti).toBe("public.heic")
})
