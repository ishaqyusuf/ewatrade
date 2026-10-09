import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { bundle } from "@remotion/bundler"
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const variant = process.argv[2] || "web"
const contract = JSON.parse(
  await readFile(path.join(root, "output/media-contract.json"), "utf8"),
)
const introOnly = process.argv.includes("--intro-only")
const inputProps = introOnly
  ? { variant, chapters: [], narration: [] }
  : contract.variants[variant]
if (!inputProps)
  throw Error("Successful capture contract required for full render")
const browserExecutable =
  process.env.VIDEO_CHROME ||
  "/Users/M1PRO/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/index.jsx"),
  publicDir: path.join(root, "public"),
  outDir: path.join(
    root,
    `.bundle-${variant}${process.argv.includes("--poster-only") ? "-poster" : ""}`,
  ),
})
const composition = await selectComposition({
  serveUrl,
  id: variant === "web" ? "Web" : "Mobile",
  inputProps,
  browserExecutable,
})
const firstChapter = inputProps.chapters[0]
const eventSeconds = (name) =>
  firstChapter?.events.find((event) => event.name === name)?.elapsedMs / 1000
const posterSeconds = introOnly
  ? 2
  : 8 +
    3 +
    (eventSeconds("added") - eventSeconds("setup-entry") - 0.5) /
      firstChapter.speed
await renderStill({
  serveUrl,
  composition: {
    ...composition,
    props: { ...composition.props, poster: !introOnly },
  },
  inputProps: { ...inputProps, poster: !introOnly },
  frame: Math.round(posterSeconds * 24),
  output: path.join(root, `output/${variant}-poster.jpg`),
  imageFormat: "jpeg",
  browserExecutable,
})
if (process.argv.includes("--poster-only")) process.exit(0)
let last = -1
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  browserExecutable,
  codec: "h264",
  audioCodec: "aac",
  audioBitrate: "96k",
  crf: 24,
  concurrency: 2,
  frameRange: introOnly ? [0, 191] : undefined,
  outputLocation: path.join(
    root,
    `output/${variant}-${introOnly ? "intro" : "review"}.mp4`,
  ),
  onProgress: ({ progress }) => {
    const n = Math.floor(progress * 10)
    if (n !== last) {
      console.log(`${variant}: ${n * 10}%`)
      last = n
    }
  },
})
