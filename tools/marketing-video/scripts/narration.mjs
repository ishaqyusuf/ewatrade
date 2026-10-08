import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { env } from "@huggingface/transformers"
import { KokoroTTS } from "kokoro-js"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
env.cacheDir = path.join(root, ".cache")
await mkdir(path.join(root, "public/narration"), { recursive: true })
const businesses = JSON.parse(
  await readFile(path.join(root, "fixtures/businesses.json"), "utf8"),
)
const tts = await KokoroTTS.from_pretrained(
  "onnx-community/Kokoro-82M-v1.0-ONNX",
  {
    dtype: "q8",
    device: "cpu",
    progress_callback: (p) => {
      if (p.status === "done") console.log(`Loaded ${p.file}`)
    },
  },
)
const entries = [
  {
    id: "intro",
    narration:
      "Five businesses. One place to begin. A real EwaTrade setup rehearsal.",
  },
  ...businesses,
  {
    id: "outro",
    narration: "Your business. Your next chapter. Come. Trade. Together.",
  },
]
const manifest = []
for (const entry of entries) {
  const sentences = entry.narration
    .match(/[^.!?]+[.!?]?/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const cues = []
  let offset = 0
  const files = []
  for (let i = 0; i < sentences.length; i++) {
    const file = path.join(root, `public/narration/${entry.id}-${i}.wav`)
    const audio = await tts.generate(sentences[i], {
      voice: "af_heart",
      speed: 1,
    })
    await audio.save(file)
    const duration = Number(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          file,
        ],
        { encoding: "utf8" },
      ).trim(),
    )
    cues.push({ text: sentences[i], start: offset, end: offset + duration })
    offset += duration
    files.push(file)
  }
  const list = path.join(root, `output/${entry.id}-narration.txt`)
  await writeFile(list, files.map((f) => `file '${f}'`).join("\n"))
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c:a",
    "pcm_s16le",
    path.join(root, `public/narration/${entry.id}.wav`),
  ])
  manifest.push({ id: entry.id, durationSeconds: offset, cues })
  console.log(`${entry.id}: ${offset.toFixed(2)}s`)
}
await writeFile(
  path.join(root, "output/narration.json"),
  JSON.stringify(
    {
      engine: "Kokoro-82M-v1.0-ONNX",
      voice: "af_heart",
      license: "Apache-2.0",
      manifest,
    },
    null,
    2,
  ),
)
