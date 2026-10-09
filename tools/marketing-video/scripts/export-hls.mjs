import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const onlyVariant = process.argv
  .find((arg) => arg.startsWith("--variant="))
  ?.split("=")[1]
if (onlyVariant && !["web", "mobile"].includes(onlyVariant))
  throw Error("Unknown variant")
for (const variant of onlyVariant ? [onlyVariant] : ["web", "mobile"]) {
  const dir = path.join(root, `output/hls/${variant}`)
  await mkdir(dir, { recursive: true })
  const streams = []
  for (const [name, shortEdge, bitrate] of [
    ["low", 480, 450000],
    ["high", 720, 1100000],
  ]) {
    const width =
      variant === "web" ? Math.round((shortEdge * 16) / 9 / 2) * 2 : shortEdge
    const height =
      variant === "web" ? shortEdge : Math.round((shortEdge * 16) / 9 / 2) * 2
    const output = path.join(dir, name)
    await mkdir(output, { recursive: true })
    execFileSync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      path.join(root, `output/${variant}-review.mp4`),
      "-vf",
      `scale=${width}:${height}`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-b:v",
      String(bitrate),
      "-maxrate",
      String(bitrate),
      "-bufsize",
      String(bitrate * 2),
      "-g",
      "96",
      "-keyint_min",
      "96",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      path.join(output, "segment-%03d.ts"),
      path.join(output, "index.m3u8"),
    ])
    streams.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate + 80000},RESOLUTION=${width}x${height}\n${name}/index.m3u8`,
    )
  }
  await writeFile(
    path.join(dir, "master.m3u8"),
    `#EXTM3U\n#EXT-X-VERSION:3\n${streams.join("\n")}\n`,
  )
  console.log(
    `${variant}: ${variant === "web" ? "854×480 +1280×720" : "480×854 +720×1280"} HLS prepared locally`,
  )
}
