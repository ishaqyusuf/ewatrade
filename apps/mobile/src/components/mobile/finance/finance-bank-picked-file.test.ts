import { describe, expect, test } from "bun:test"
import { readNativeBankPickedFile } from "./finance-bank-picked-file"

function fixture({
  uri = "file:///cache/DocumentPicker/owned.csv",
  size = 4,
  actual = 4,
  current = () => true,
} = {}) {
  let reads = 0
  let deletes = 0
  const file = {
    uri,
    size,
    exists: true,
    bytes: async () => {
      reads += 1
      return new Uint8Array(actual)
    },
    delete: () => {
      deletes += 1
    },
  }
  return {
    run: () =>
      readNativeBankPickedFile({
        asset: { uri, name: "bank.csv" },
        web: false,
        cacheUri: "file:///cache/",
        openFile: () => file,
        isCurrent: current,
      }),
    counts: () => ({ reads, deletes }),
    file,
  }
}
describe("native bank picker ingress", () => {
  test("unknown provider metadata uses known local size and clears owned copy", async () => {
    const f = fixture()
    expect((await f.run())?.byteLength).toBe(4)
    expect(f.counts()).toEqual({ reads: 1, deletes: 1 })
  })
  test("rejects oversized or unreadable local copies before allocating bytes", async () => {
    for (const size of [0, 524289, Number.NaN]) {
      const f = fixture({ size })
      await expect(f.run()).rejects.toThrow("512 KiB")
      expect(f.counts()).toEqual({ reads: 0, deletes: 1 })
    }
  })
  test("never deletes provider originals or other cache files", async () => {
    for (const uri of [
      "content://provider/bank.csv",
      "file:///cache/original.csv",
      "file:///cache/DocumentPickerOther/bank.csv",
    ]) {
      const f = fixture({ uri })
      await f.run()
      expect(f.counts()).toEqual({ reads: 1, deletes: 0 })
    }
  })
  test("stale picker return cleans its copy without reading", async () => {
    const f = fixture({ current: () => false })
    expect(await f.run()).toBeNull()
    expect(f.counts()).toEqual({ reads: 0, deletes: 1 })
  })
  test("changed size is refused and copy removed", async () => {
    const f = fixture({ actual: 5 })
    await expect(f.run()).rejects.toThrow("changed")
    expect(f.counts()).toEqual({ reads: 1, deletes: 1 })
  })
  test("cleanup failure refuses delivery of private file bytes", async () => {
    const f = fixture()
    f.file.delete = () => {
      throw new Error("denied")
    }
    await expect(f.run()).rejects.toThrow("temporary CSV copy")
  })
})
