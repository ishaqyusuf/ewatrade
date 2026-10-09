import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const businesses = JSON.parse(
  await readFile(path.join(root, "fixtures/businesses.json"), "utf8"),
)
const narration = JSON.parse(
  await readFile(path.join(root, "output/narration.json"), "utf8"),
)
const format = (s) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`
const chapters = businesses.map((b, i) => ({
  id: b.id,
  label: b.label,
  profileKey: b.profileKey,
  startSeconds: 8 + i * 26,
  endSeconds: 34 + i * 26,
}))
const onlyVariant = process.argv
  .find((arg) => arg.startsWith("--variant="))
  ?.split("=")[1]
if (onlyVariant && !["web", "mobile"].includes(onlyVariant))
  throw Error("Unknown variant")
const previousVariants = onlyVariant
  ? JSON.parse(
      await readFile(
        path.join(root, "output/media-contract.json"),
        "utf8",
      ).catch(() => "{}"),
    ).variants || {}
  : {}
const cues = []
for (const track of narration.manifest) {
  const start =
    track.id === "intro"
      ? 0
      : track.id === "outro"
        ? 138
        : chapters.find((c) => c.id === track.id).startSeconds + 4
  for (const cue of track.cues)
    cues.push({ ...cue, start: start + cue.start, end: start + cue.end })
}
await writeFile(
  path.join(root, "output/captions-en.vtt"),
  `WEBVTT\n\n${cues
    .map(
      (c, i) =>
        `${i + 1}\n${format(c.start)} --> ${format(c.end)}\n${c.text}\n`,
    )
    .join("\n")}`,
)
await writeFile(
  path.join(root, "output/chapters.vtt"),
  `WEBVTT\n\n${chapters
    .map(
      (c, i) =>
        `${i + 1}\n${format(c.startSeconds)} --> ${format(c.endSeconds)}\n${c.label}\n`,
    )
    .join("\n")}`,
)
const contract = {
  version: 1,
  title: "Your business. Your next chapter.",
  status: "review-only",
  source: {
    assistantRelease: "55915e79",
    candidateCommit: "c4b72daa",
    runtime: "https://capture-dashboard.localhost",
    model: "existing provider-free QA rehearsal",
  },
  durationSeconds: 146,
  fps: 24,
  chapterStarts: Object.fromEntries(
    chapters.map((c) => [c.id, c.startSeconds]),
  ),
  chapters,
  variants: previousVariants,
  captions: cues,
}
if (!process.argv.includes("--captions-only"))
  for (const variant of onlyVariant ? [onlyVariant] : ["web", "mobile"]) {
    const capture = JSON.parse(
      await readFile(path.join(root, `output/capture-${variant}.json`), "utf8"),
    )
    const data = []
    for (const business of businesses) {
      const result = capture.results.find((r) => r.id === business.id)
      if (!result || result.error || !result.setupElapsedMs)
        throw Error(
          `Missing successful ${variant}/${business.id} capture; no placeholder UI permitted`,
        )
      const entry = result.events.find((e) => e.name === "setup-entry")
      const dir = path.join(root, `public/captures/${variant}/${business.id}`)
      const duration = result.setupElapsedMs / 1000 + 2
      const speed = Math.max(1, duration / 23)
      execFileSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-ss",
        String(entry.elapsedMs / 1000),
        "-i",
        path.join(dir, "raw.webm"),
        "-t",
        String(duration),
        "-vf",
        `setpts=(PTS-STARTPTS)/${speed},tpad=stop_mode=clone:stop_duration=23,fps=24`,
        "-t",
        "23",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        path.join(dir, "setup.mp4"),
      ])
      data.push({ ...business, ...result, speed })
    }
    contract.variants[variant] = {
      variant,
      chapters: data,
      narration: narration.manifest,
    }
  }
await writeFile(
  path.join(root, "output/media-contract.json"),
  JSON.stringify(contract, null, 2),
)
console.log(
  `Captions and chapters generated; ${Object.keys(contract.variants).length} variants prepared.`,
)
