import { expect, test } from "bun:test"
import { notifyLocalReleaseChecklist } from "./release-notify"

const summary = {
  environment: "preview" as const,
  revision: "a".repeat(40),
  actionCount: 6,
  dirtyCount: 4,
}

test("opt-in desktop summary is local and explicitly advisory", () => {
  const notices: string[][] = []
  const result = notifyLocalReleaseChecklist(summary, {
    platform: "darwin",
    desktop: (title, body) => {
      notices.push([title, body])
    },
  })
  expect(result.channel).toBe("desktop")
  expect(notices).toEqual([
    [
      "EwaTrade preview release checklist",
      "6 actions to review; 4 uncommitted inputs (aaaaaaaa). Advisory status; verify release proof separately.",
    ],
  ])
})

test("unsupported platform and failed desktop delivery fall back to terminal", () => {
  const notices: string[] = []
  const terminal = (message: string) => {
    notices.push(message)
  }
  expect(
    notifyLocalReleaseChecklist(summary, {
      platform: "linux",
      desktop: () => {
        throw new Error("must not run")
      },
      terminal,
    }).channel,
  ).toBe("terminal")
  expect(
    notifyLocalReleaseChecklist(summary, {
      platform: "darwin",
      desktop: () => {
        throw new Error("secret provider data")
      },
      terminal,
    }).channel,
  ).toBe("terminal")
  expect(notices).toHaveLength(2)
  expect(notices.join("\n")).not.toContain("secret provider data")
})

test("untrusted freeform values cannot reach a notification", () => {
  let called = false
  expect(() =>
    notifyLocalReleaseChecklist(
      { ...summary, revision: '" & do shell script "anything"' },
      {
        desktop: () => {
          called = true
        },
      },
    ),
  ).toThrow("valid advisory")
  expect(() =>
    notifyLocalReleaseChecklist({ ...summary, dirtyCount: -1 }),
  ).toThrow("valid advisory")
  expect(called).toBe(false)
})
