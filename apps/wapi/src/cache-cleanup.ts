import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"

const schema = z.object({
  cache: z.string(),
  download: z.string().regex(/^[a-f0-9]{16}$/),
  transcript: z.string().regex(/^[a-f0-9]{64}$/),
  extension: z.enum(["wav", "webm", "ogg", "m4a", "mp3"]),
  createdAt: z.number(),
})
type Entry = z.infer<typeof schema>
const journal = join(tmpdir(), "ewatrade-voice-cleanup")
export async function registerCacheCleanup(entry: Entry) {
  const valid = schema.parse(entry)
  await mkdir(journal, { recursive: true, mode: 0o700 })
  const manifest = join(journal, `${valid.transcript}.json`)
  await writeFile(manifest, JSON.stringify(valid), { mode: 0o600 })
  return async () => {
    await clear(valid)
    await rm(manifest, { force: true })
  }
}
async function clear(entry: Entry) {
  await Promise.all(
    [
      join(entry.cache, "audio", `${entry.download}.${entry.extension}`),
      join(entry.cache, "clips", `${entry.transcript.slice(0, 16)}.wav`),
      join(entry.cache, "transcripts", `${entry.transcript}.json`),
    ].map((file) => rm(file, { force: true })),
  )
}
/** Only this adapter's abandoned files, after a long grace for local inference. */
export async function sweepCacheCleanup(cache: string) {
  const names = await readdir(journal).catch(() => [])
  for (const name of names.slice(0, 500)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
    try {
      const entry = schema.parse(
        JSON.parse(await readFile(join(journal, name), "utf8")),
      )
      if (entry.cache !== cache || Date.now() - entry.createdAt < 15 * 60_000)
        continue
      await clear(entry)
      await rm(join(journal, name), { force: true })
    } catch {
      /* Leave a failed cleanup manifest for the next sweep. */
    }
  }
}
