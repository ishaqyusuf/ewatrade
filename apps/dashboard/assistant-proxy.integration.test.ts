import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { nextConfig } from "./next.config"

const enabled = process.env.RUN_ASSISTANT_PROXY_INTEGRATION === "1"
;(enabled ? test : test.skip)(
  "dashboard proxy retains an assistant stream across a long tool step",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ewatrade-proxy-"))
    const resultPath = join(directory, "result.json")
    try {
      const child = Bun.spawn(
        [
          "node",
          fileURLToPath(
            new URL("./scripts/assistant-proxy-check.cjs", import.meta.url),
          ),
          String(nextConfig.experimental?.proxyTimeout ?? ""),
          "31000",
          resultPath,
        ],
        { stdin: "ignore", stdout: "inherit", stderr: "inherit" },
      )
      expect(await child.exited).toBe(0)
      const result = JSON.parse(await readFile(resultPath, "utf8"))
      expect(result.completed).toBe(true)
      expect(result.elapsedMs).toBeGreaterThan(30_000)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  45_000,
)
