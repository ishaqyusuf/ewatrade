import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DOMParser } from "@xmldom/xmldom"

// The exact mounted cases the isolated child must execute and pass.
const CASES = [
  "a recorded stock result shows the saved operation reference",
  "the reference stays after a balance refresh failure",
  "an unreadable id keeps the result recorded with a truthful unavailable reference",
  "failed and unknown results never show a reference",
  "analytics never receive the saved reference",
]

test("actual stock outcome shows the saved reference only on a recorded result", async () => {
  const fixture = new URL(
    "./stock-outcome-reference.fixture.tsx",
    import.meta.url,
  ).pathname
  const directory = await mkdtemp(
    join(tmpdir(), "ewatrade-mobile-stock-reference-"),
  )
  const report = join(directory, "result.xml")
  try {
    // Bun's nested reporter may return empty captured streams despite a
    // successful run. Its result file also proves these exact tests executed.
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--env-file=/dev/null",
        "test",
        "--reporter=junit",
        `--reporter-outfile=${report}`,
        fixture,
      ],
      {
        cwd: new URL("../../../../", import.meta.url).pathname,
        env: { PATH: process.env.PATH, NODE_ENV: "test" },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 25_000,
      },
    )
    if (result.exitCode !== 0)
      throw Error(
        new TextDecoder().decode(result.stderr) ||
          new TextDecoder().decode(result.stdout) ||
          `Mounted child exit=${result.exitCode} signal=${result.signalCode ?? "none"}`,
      )
    const document = new DOMParser().parseFromString(
      await readFile(report, "utf8"),
      "application/xml",
    )
    const summary = document.documentElement
    if (!summary) throw Error("Mounted child produced no result summary")
    expect(summary.tagName).toBe("testsuites")
    expect(summary.getAttribute("tests")).toBe(String(CASES.length))
    expect(summary.getAttribute("failures")).toBe("0")
    expect(summary.getAttribute("skipped")).toBe("0")
    const cases = document.getElementsByTagName("testcase")
    expect(
      Array.from({ length: cases.length }, (_, i) =>
        cases.item(i)?.getAttribute("name"),
      ),
    ).toEqual(CASES)
    for (let i = 0; i < cases.length; i++)
      expect(cases.item(i)?.getElementsByTagName("skipped").length).toBe(0)
    expect(result.exitCode).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
