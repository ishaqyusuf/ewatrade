import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DOMParser } from "@xmldom/xmldom"

// The exact mounted cases the isolated child must execute and pass.
// Each scenario runs against the plain source and a React Compiler build.
const NAMES = [
  "a future delivery keeps fulfilment unavailable",
  "moving the due time back to now catches the clock up once and enables fulfilment, without looping",
  "a due time a moment ahead enables itself when it arrives",
  "returning to the app re-reads the clock",
  "without Product lines the reason is unchanged",
]
const CASES = [...NAMES, ...NAMES]
const BUILDS = [
  ...NAMES.map(() => "source"),
  ...NAMES.map(() => "React Compiler build"),
]

test("actual sale fulfilment clock stays fresh under the React Compiler and never loops", async () => {
  const fixture = new URL(
    "./sale-fulfillment-clock.fixture.tsx",
    import.meta.url,
  ).pathname
  const directory = await mkdtemp(
    join(tmpdir(), "ewatrade-mobile-sale-fulfillment-clock-"),
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
    expect(
      Array.from({ length: cases.length }, (_, i) =>
        cases.item(i)?.getAttribute("classname"),
      ),
    ).toEqual(BUILDS)
    for (let i = 0; i < cases.length; i++)
      expect(cases.item(i)?.getElementsByTagName("skipped").length).toBe(0)
    expect(result.exitCode).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
