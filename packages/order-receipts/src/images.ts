import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
// PDF.js runs its worker in-process on servers. Importing it registers
// globalThis.pdfjsWorker, so no worker URL is resolved at runtime and server
// bundles keep the worker as an ordinary dependency.
import "pdfjs-dist/legacy/build/pdf.worker.mjs"
import { ReceiptRenderError } from "./types"

// @napi-rs/canvas is native, so server bundles keep it external. Loading it only
// here means a missing binary fails image rendering, never server startup.
async function loadCanvas() {
  try {
    return await import("@napi-rs/canvas")
  } catch (error) {
    throw new Error("Receipt image rendering is unavailable on this server.", {
      cause: error,
    })
  }
}

export async function renderReceiptImages(pdf: Uint8Array) {
  const { createCanvas } = await loadCanvas()
  const task = getDocument({
    data: Uint8Array.from(pdf),
    isEvalSupported: false,
    useSystemFonts: false,
  })
  try {
    const document = await task.promise
    if (document.numPages > 100)
      throw new ReceiptRenderError(
        "Too many pages. Select fewer Orders for mobile export.",
      )
    const pages: Array<{ base64: string; width: number; height: number }> = []
    let bytes = 0
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      )
      try {
        await page.render({
          canvas: null,
          canvasContext: canvas.getContext(
            "2d",
          ) as unknown as CanvasRenderingContext2D,
          viewport,
          background: "white",
        }).promise
        const png = await canvas.encode("png")
        bytes += png.length
        if (bytes > 12 * 1024 * 1024)
          throw new ReceiptRenderError(
            "Receipt images are too large. Select fewer Orders.",
          )
        pages.push({
          base64: png.toString("base64"),
          width: canvas.width,
          height: canvas.height,
        })
      } finally {
        page.cleanup()
        canvas.width = 1
        canvas.height = 1
      }
    }
    return pages
  } finally {
    await task.destroy()
  }
}
