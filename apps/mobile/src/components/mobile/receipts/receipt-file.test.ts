import { expect, mock, test } from "bun:test"

let allowed = true
let failWrite = false
const events: string[] = []
mock.module("react-native", () => ({ Platform: { OS: "android" } }))
mock.module("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///receipt-test/",
  EncodingType: { Base64: "base64" },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: async () => ({
      granted: allowed,
      directoryUri: "content://folder",
    }),
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
  },
  deleteAsync: async () => {
    events.push("cleanup")
  },
}))
mock.module("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => {
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
