import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DOMParser } from "@xmldom/xmldom"

// The exact mounted cases the isolated child must execute and pass.
const CASES = [
  "thresholds: five or fewer is compact; search past seven, or six-seven when overflowing",
  "up to five balances: a small sheet with no search, and a stale query is cleared",
  "six or seven: full, search appears only once the list overflows, then stays while filtering",
  "the bottom search uses the standard floating pill with standard side spacing",
  "more than seven: bottom search from the start, decided by the unfiltered count",
  "Android full: an edge-to-edge screen with its own header; iOS keeps a full sheet",
  "choosing a balance edits the draft and closes; locked drafts disable rows",
  "a first server load opens a compact sheet with exactly three skeleton rows, then settles into the full view",
  "already loaded balances open directly without skeletons; a load error is distinct from loading",
]

test("actual stock balance chooser adapts sheet, screen and bottom search to the eligible count", async () => {
  const fixture = new URL(
    "./stock-balance-chooser.fixture.tsx",
    import.meta.url,
  ).pathname
  const directory = await mkdtemp(
    join(tmpdir(), "ewatrade-mobile-stock-chooser-"),
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
