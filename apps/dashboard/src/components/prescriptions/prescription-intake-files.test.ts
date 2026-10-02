import { describe, expect, test } from "bun:test"
import { validatePrescriptionIntakeFiles } from "./prescription-intake-files"

function file(name: string, type: string, size: number) {
  return { name, size, type } as File
}

describe("prescription intake files", () => {
  test("accepts supported files within the API page and size limits", () => {
    expect(
      validatePrescriptionIntakeFiles([
        file("page.pdf", "application/pdf", 10_000_000),
        file("photo.webp", "image/webp", 10_000_000),
      ]),
    ).toBeNull()
  })

  test("rejects excess pages, unsupported media, oversized and empty files", () => {
    expect(
      validatePrescriptionIntakeFiles(
        Array.from({ length: 13 }, (_, index) =>
          file(`page-${index}.pdf`, "application/pdf", 1),
        ),
      ),
    ).toContain("no more than 12")
    expect(
      validatePrescriptionIntakeFiles([file("notes.txt", "text/plain", 1)]),
    ).toContain("not a supported")
    expect(
      validatePrescriptionIntakeFiles([
        file("large.pdf", "application/pdf", 10_000_001),
      ]),
    ).toContain("larger than 10 MB")
    expect(
      validatePrescriptionIntakeFiles([
        file("empty.pdf", "application/pdf", 0),
      ]),
    ).toContain("is empty")
  })
})
