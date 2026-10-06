import { receiptFileStem } from "@ewatrade/order-receipts"
import { pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

type ImageFile = { name: string; bytes: Uint8Array }

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files: ImageFile[]) {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const file of files) {
    const name = new TextEncoder().encode(file.name)
    const header = new Uint8Array(30 + name.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x800, true)
    view.setUint32(14, crc32(file.bytes), true)
    view.setUint32(18, file.bytes.length, true)
    view.setUint32(22, file.bytes.length, true)
    view.setUint16(26, name.length, true)
    header.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x800, true)
    cv.setUint32(16, crc32(file.bytes), true)
    cv.setUint32(20, file.bytes.length, true)
    cv.setUint32(24, file.bytes.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    chunks.push(header, Uint8Array.from(file.bytes))
    directory.push(central)
    offset += header.length + file.bytes.length
  }
  const size = directory.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, size, true)
  ev.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end], { type: "application/zip" })
}

export async function receiptImages(
  pdfBytes: Uint8Array,
  orderNumbers: string[],
  onProgress: (value: string) => void,
) {
  const task = pdfjs.getDocument({ data: pdfBytes.slice() })
  const document = await task.promise
  try {
    if (document.numPages > 100)
      throw new Error(
        "Too many pages for image export. Download PDF or select fewer Orders.",
      )
    const files: ImageFile[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      onProgress(`Preparing image ${pageNumber} of ${document.numPages}…`)
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = window.document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (!context)
        throw new Error(
          "Your browser could not prepare the image. Download PDF instead.",
        )
      await page.render({
        canvasContext: context,
        canvas,
        viewport,
        background: "white",
      }).promise
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Image preparation failed.")),
          "image/png",
        ),
      )
      const text = await page.getTextContent()
      const orderNumber = text.items
        .map((item) => ("str" in item ? item.str : ""))
        .find((value) => orderNumbers.includes(value))
      if (!orderNumber)
        throw new Error(
          "Could not identify the receipt page. Download PDF instead.",
        )
      const suffix =
        document.numPages === 1
          ? ""
          : `-page-${String(pageNumber).padStart(2, "0")}`
      files.push({
        name: `${receiptFileStem(orderNumber)}${suffix}.png`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      })
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
    const first = files[0]
    if (files.length === 1 && first)
      return {
        blob: new Blob([Uint8Array.from(first.bytes)], { type: "image/png" }),
        filename: first.name,
      }
    return {
      blob: zip(files),
      filename:
        orderNumbers.length === 1
          ? `${receiptFileStem(orderNumbers[0] ?? "order")}-images.zip`
          : "order-receipt-images.zip",
    }
  } finally {
    await document.destroy()
  }
}
