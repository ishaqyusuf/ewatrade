import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DOMParser } from "@xmldom/xmldom"

test("actual correction router enforces protected scope, strict admission and error mapping", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ewatrade-correction-routes-"))
  const report = join(directory, "result.xml")
  try {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--env-file=/dev/null",
        "test",
        "--reporter=junit",
        `--reporter-outfile=${report}`,
        new URL(
          "./fixtures/offline-quick-sale-correction-routes.fixture.ts",
          import.meta.url,
        ).pathname,
      ],
      {
        cwd: new URL("../../../../../", import.meta.url).pathname,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          EWATRADE_DATABASE_URL:
            "postgresql://inert:inert@offline-tests.invalid:5432/inert",
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 25_000,
      },
    )
    if (result.exitCode !== 0)
      throw Error(
        new TextDecoder().decode(result.stderr) ||
          new TextDecoder().decode(result.stdout),
      )
    const document = new DOMParser().parseFromString(
      await readFile(report, "utf8"),
      "application/xml",
    )
    const summary = document.documentElement
    if (!summary) throw Error("Missing correction route results")
    expect(summary.getAttribute("tests")).toBe("57")
    expect(summary.getAttribute("failures")).toBe("0")
    expect(summary.getAttribute("skipped")).toBe("0")
    expect(document.getElementsByTagName("testcase").length).toBe(57)
    expect(result.exitCode).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
