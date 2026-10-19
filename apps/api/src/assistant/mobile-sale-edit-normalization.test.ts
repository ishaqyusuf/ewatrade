import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DOMParser } from "@xmldom/xmldom"

test("actual public edit projection and internal approval digest boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sale-edit-normalization-"))
  const report = join(directory, "result.xml")
  try {
    const child = Bun.spawnSync(
      [
        process.execPath,
        "--env-file=/dev/null",
        "test",
        "--reporter=junit",
        `--reporter-outfile=${report}`,
        new URL(
          "./fixtures/mobile-sale-edit-normalization.fixture.ts",
          import.meta.url,
        ).pathname,
      ],
      {
        cwd: new URL("../../../../", import.meta.url).pathname,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          APP_ENV: "local",
          EWATRADE_DATABASE_URL:
            "postgresql://inert:inert@description-normalization.invalid:5432/inert",
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 25_000,
      },
    )
    if (child.exitCode !== 0)
      throw Error(
        new TextDecoder().decode(child.stderr) ||
          new TextDecoder().decode(child.stdout),
      )
    const document = new DOMParser().parseFromString(
      await readFile(report, "utf8"),
      "application/xml",
    )
    const summary = document.documentElement
    if (!summary) throw Error("Missing edit normalization results")
    expect(summary.getAttribute("tests")).toBe("4")
    expect(summary.getAttribute("failures")).toBe("0")
    expect(summary.getAttribute("skipped")).toBe("0")
    expect(document.getElementsByTagName("testcase").length).toBe(4)
    expect(child.exitCode).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
