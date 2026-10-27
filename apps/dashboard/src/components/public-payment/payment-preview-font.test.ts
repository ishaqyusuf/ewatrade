import { expect, mock, test } from "bun:test"
import { join } from "node:path"

mock.module("server-only", () => ({}))

test("every preview face is bundled and readable from the dashboard root", async () => {
  const previousDirectory = process.cwd()
  try {
    // Next serves the dashboard with apps/dashboard as the working directory.
    process.chdir(join(import.meta.dir, "../../.."))
    const { paymentPreviewFonts } = await import("./payment-preview-font")
    const fonts = await paymentPreviewFonts()
    expect(fonts.map(({ name, weight }) => `${name} ${weight}`)).toEqual([
      "Figtree 500",
      "Figtree 600",
      "Figtree 700",
      "Figtree 800",
      "Inter 400",
    ])
    for (const font of fonts)
      expect(font.data.byteLength).toBeGreaterThan(40_000)
  } finally {
    process.chdir(previousDirectory)
  }
})
