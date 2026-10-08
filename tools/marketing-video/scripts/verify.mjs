import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contract = JSON.parse(
  await readFile(path.join(root, "output/media-contract.json"), "utf8"),
)
const profiles = JSON.parse(
  await readFile(
    path.join(root, "../../packages/utils/src/business-profiles.json"),
    "utf8",
  ),
)
assert.equal(contract.chapters.length, 5)
assert.deepEqual(
  contract.chapters.map((c) => c.id),
  ["poultry", "pharmacy", "boutique", "laundry", "bakery"],
)
for (const chapter of contract.chapters)
  assert(profiles.profiles.some((p) => p.key === chapter.profileKey))
let previous = 0
for (const cue of contract.captions) {
  assert(cue.start >= previous)
  assert(cue.end > cue.start)
  assert(cue.end <= contract.durationSeconds)
  previous = cue.end
}
const report = {
  verifiedAt: new Date().toISOString(),
  status: "review-only",
  durationSeconds: contract.durationSeconds,
  variants: [],
}
if (!process.argv.includes("--captions-only"))
  for (const variant of ["web", "mobile"]) {
    const filename = path.join(root, `output/${variant}-review.mp4`)
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          filename,
        ],
        { encoding: "utf8" },
      ),
    )
    const video = probe.streams.find((s) => s.codec_type === "video")
    const audio = probe.streams.find((s) => s.codec_type === "audio")
    assert.equal(video.codec_name, "h264")
    assert.equal(audio.codec_name, "aac")
    assert(Math.abs(Number(probe.format.duration) - 146) < 0.1)
    assert.equal(video.avg_frame_rate, "24/1")
    assert.equal(video.width, variant === "web" ? 1920 : 720)
    assert.equal(video.height, variant === "web" ? 1080 : 1280)
    assert(Number(audio.duration) > 145.9)
    const captured = JSON.parse(
      await readFile(path.join(root, `output/capture-${variant}.json`), "utf8"),
    )
    assert.equal(captured.results.length, 5)
    assert(
      captured.results.every(
        (r) => !r.error && r.classification === "QA" && r.setupElapsedMs > 0,
      ),
    )
    const signup = JSON.parse(
      await readFile(
        path.join(root, `output/capture-signup-${variant}.json`),
        "utf8",
      ),
    )
    const refresh = JSON.parse(
      await readFile(
        path.join(root, "output/signup-refresh-verification.json"),
        "utf8",
      ),
    )
    assert.equal(signup.results.length, 5)
    for (const chapter of captured.results) {
      const form = signup.results.find((r) => r.id === chapter.id)
      assert(
        form && !form.error && form.readOnly && form.blockedWrites.length === 0,
      )
      assert.equal(form.heading, "Start your next chapter.")
      const png = await readFile(
        path.join(
          root,
          `public/captures/${variant}/${chapter.id}/signup-form.png`,
        ),
      )
      assert.equal(
        createHash("sha256").update(png).digest("hex"),
        refresh.results.find(
          (r) => r.variant === variant && r.id === chapter.id,
        )?.sha256,
      )
    }
    const bytes = await readFile(filename)
    report.variants.push({
      variant,
      bytes: (await stat(filename)).size,
      width: video.width,
      height: video.height,
      durationSeconds: Number(probe.format.duration),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      setupElapsedMs: captured.results.map((r) => ({
        id: r.id,
        milliseconds: r.setupElapsedMs,
        commit: r.commit,
      })),
    })
  }
await writeFile(
  path.join(root, "output/verification.json"),
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report, null, 2))
