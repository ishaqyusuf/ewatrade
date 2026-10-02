import { describe, expect, test } from "bun:test"
import { barcodeScanValue, distinctScannedBarcodes } from "./barcode-scan"

describe("barcode capture boundary", () => {
  test("keeps leading zeros and alphanumeric warehouse codes", () => {
    expect(barcodeScanValue("0012345678905")).toBe("0012345678905")
    expect(barcodeScanValue("  EGG-001A  ")).toBe("EGG-001A")
  })
  test("rejects empty, control-bearing and oversized results without truncation", () => {
    expect(barcodeScanValue("  ")).toBeNull()
    expect(barcodeScanValue("123\n456")).toBeNull()
    expect(barcodeScanValue("X".repeat(121))).toBeNull()
    expect(barcodeScanValue("X".repeat(120))).toHaveLength(120)
  })
  test("deduplicates detections but keeps different codes for explicit selection", () => {
    expect(
      distinctScannedBarcodes([
        { data: "00123" },
        { data: "00123" },
        { data: "00456" },
        { data: "" },
      ]),
    ).toEqual(["00123", "00456"])
  })
})
