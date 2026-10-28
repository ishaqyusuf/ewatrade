import { fileURLToPath } from "node:url"
import { parentPort } from "node:worker_threads"

// Same disposable-worker boundary as the catalog HEIC decoder. Never emit file data.
parentPort.once("message", async ({ bytes }) => {
  let diagnostic = false
  console.log =
    console.warn =
    console.error =
      () => {
        diagnostic = true
      }
  let task
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
    const { createCanvas } = await import("@napi-rs/canvas")
    const moduleUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")
    task = getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      verbosity: 1,
      stopAtErrors: true,
      maxImageSize: 4_000_000,
      standardFontDataUrl: fileURLToPath(
        new URL("../../standard_fonts/", moduleUrl),
      ),
      cMapUrl: fileURLToPath(new URL("../../cmaps/", moduleUrl)),
      cMapPacked: true,
      wasmUrl: fileURLToPath(new URL("../../wasm/", moduleUrl)),
    })
    const document = await task.promise
    if (document.numPages < 1 || document.numPages > 3)
      throw new Error("Unsupported PDF")
    const pages = []
    let pixels = 0
    let outputBytes = 0
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      const viewport = page.getViewport({ scale: 2 })
      const width = Math.ceil(viewport.width)
      const height = Math.ceil(viewport.height)
      pixels += width * height
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        width * height > 4_000_000 ||
        pixels > 8_000_000
      )
        throw new Error("Unsupported PDF")
      const canvas = createCanvas(width, height)
      try {
        await page.render({
          canvas: null,
          canvasContext: canvas.getContext("2d"),
          viewport,
          background: "white",
          annotationMode: 0,
        }).promise
        const png = await canvas.encode("png")
        outputBytes += png.byteLength
        if (outputBytes > 4 * 1024 * 1024) throw new Error("Unsupported PDF")
        pages.push({ width, height, bytes: new Uint8Array(png) })
      } finally {
        page.cleanup()
        canvas.width = 1
        canvas.height = 1
      }
    }
    if (diagnostic) throw new Error("Incomplete PDF rendering")
    parentPort.postMessage(
      pages,
      pages.map((page) => page.bytes.buffer),
    )
  } catch {
    parentPort.postMessage({ failed: true })
  } finally {
    await task?.destroy().catch(() => {})
  }
})
