import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DOMParser } from "@xmldom/xmldom"

test("mounted generic Order outcome preserves exit history and message/account states", async () => {
  const directory = await mkdtemp(join(tmpdir(), "generic-outcome-actions-"))
  const report = join(directory, "result.xml")
  try {
    const fixture = new URL(
      "./generic-outcome-actions.fixture.tsx",
      import.meta.url,
    ).pathname
    const child = Bun.spawnSync(
      [
        process.execPath,
        "--env-file=/dev/null",
        "test",
        "--reporter=junit",
        `--reporter-outfile=${report}`,
        fixture,
      ],
      {
        cwd: new URL("../../../../../", import.meta.url).pathname,
        env: { PATH: process.env.PATH, NODE_ENV: "test" },
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
    if (!summary) throw Error("Missing generic outcome fixture results")
    expect(summary.getAttribute("tests")).toBe("6")
    expect(summary.getAttribute("failures")).toBe("0")
    expect(summary.getAttribute("skipped")).toBe("0")
    expect(document.getElementsByTagName("testcase").length).toBe(6)
    expect(child.exitCode).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
