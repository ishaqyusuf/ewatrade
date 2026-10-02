import { parentPort } from "node:worker_threads"

// The disposable worker isolates the synchronous WASM decoder. The parent owns
// its deadline and suppresses decoder diagnostics, which can contain file data.
parentPort.once("message", async ({ bytes, maxPixels }) => {
  let images = []
  try {
    // Bun cannot redirect worker stdout. Silence decoder logging inside this
    // worker before loading its module; errors are returned as safe flags.
    console.log = console.warn = console.error = () => {}
    const { default: heifModule } = await import("libheif-js/wasm-bundle.js")
    const heif = await heifModule
    images = new heif.HeifDecoder().decode(bytes)
    if (!images.length || images.length > 32) throw new Error("Invalid image")
    const image = images.find((entry) => entry.is_primary()) ?? images[0]
    const width = image.get_width()
    const height = image.get_height()
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > maxPixels
    )
      throw new Error("Invalid image")
    const pixels = await new Promise((resolve, reject) => {
      image.display(
        { width, height, data: new Uint8ClampedArray(width * height * 4) },
        (result) =>
          result ? resolve(result) : reject(new Error("Invalid image")),
      )
    })
    const output = new Uint8Array(pixels.data.buffer)
    parentPort.postMessage({ width, height, bytes: output }, [output.buffer])
  } catch {
    parentPort.postMessage({ failed: true })
  } finally {
    for (const image of images) image.free()
  }
})
