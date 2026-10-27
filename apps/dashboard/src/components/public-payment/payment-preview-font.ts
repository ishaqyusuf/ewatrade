import "server-only"

import { readFile } from "node:fs/promises"
import { join } from "node:path"

type PreviewFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600 | 700 | 800
  style: "normal"
}

function face(name: string, weight: PreviewFont["weight"], bytes: Buffer) {
  return {
    name,
    weight,
    style: "normal" as const,
    data: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  }
}

/**
 * Local font files (apps/dashboard/public, see public/fonts/font-provenance.json); no runtime font
 * request. Each path is a literal so Next's output file tracing can include the file.
 */
async function readFonts(): Promise<PreviewFont[]> {
  const [medium, semibold, bold, extrabold, naira] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/figtree-500.ttf")),
    readFile(join(process.cwd(), "public/fonts/figtree-600.ttf")),
    readFile(join(process.cwd(), "public/fonts/figtree-700.ttf")),
    readFile(join(process.cwd(), "public/fonts/figtree-800.ttf")),
    // Figtree has no Naira sign; the image renders "₦" in its own Inter run.
    readFile(join(process.cwd(), "public/shop-v3/inter-regular.ttf")),
  ])
  return [
    face("Figtree", 500, medium),
    face("Figtree", 600, semibold),
    face("Figtree", 700, bold),
    face("Figtree", 800, extrabold),
    face("Inter", 400, naira),
  ]
}

let loaded: Promise<PreviewFont[]> | null = null

/**
 * Fonts for the payment preview image, read once per server process. A read failure is logged
 * and retried on the next request; meanwhile the image renders with the built-in font (the
 * renderer then spells the currency as "NGN").
 */
export function paymentPreviewFonts() {
  loaded ??= readFonts().catch((error: unknown) => {
    console.error("payment preview fonts could not be read", error)
    loaded = null
    return []
  })
  return loaded
}
