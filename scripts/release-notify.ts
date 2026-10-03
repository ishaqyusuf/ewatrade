import { execFileSync } from "node:child_process"

export type ReleaseNotification = {
  environment: "preview" | "production"
  revision: string
  actionCount: number
  dirtyCount: number
}

/** Local desktop notice only; no hooks, URLs, provider data or credentials. */
export function notifyLocalReleaseChecklist(
  input: ReleaseNotification,
  options: {
    platform?: NodeJS.Platform
    desktop?: (title: string, body: string) => void
    terminal?: (message: string) => void
  } = {},
) {
  if (
    !["preview", "production"].includes(input.environment) ||
    !/^[0-9a-f]{40}$/i.test(input.revision) ||
    ![input.actionCount, input.dirtyCount].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
    throw new Error(
      "Local release notice requires a valid advisory checklist summary.",
    )
  const title = `EwaTrade ${input.environment} release checklist`
  const body = `${input.actionCount} actions to review; ${input.dirtyCount} uncommitted inputs (${input.revision.slice(0, 8)}). Advisory status; verify release proof separately.`
  const terminal = options.terminal ?? ((message) => console.error(message))
  if ((options.platform ?? process.platform) !== "darwin") {
    terminal(`${title}: ${body}`)
    return { channel: "terminal" as const, advisory: true as const }
  }
  const desktop =
    options.desktop ??
    ((noticeTitle, noticeBody) => {
      execFileSync(
        "/usr/bin/osascript",
        [
          "-e",
          "on run argv",
          "-e",
          "display notification (item 2 of argv) with title (item 1 of argv)",
          "-e",
          "end run",
          "--",
          noticeTitle,
          noticeBody,
        ],
        {
          timeout: 5_000,
          stdio: "ignore",
          env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME },
        },
      )
    })
  try {
    desktop(title, body)
    return { channel: "desktop" as const, advisory: true as const }
  } catch {
    terminal(`${title}: ${body}`)
    return { channel: "terminal" as const, advisory: true as const }
  }
}
