import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  type Agent,
  acknowledgeChat,
  displayEntry,
  inbox,
  postChat,
  readChat,
} from "./lib/agent-chat"

const help = `Shared local Markdown chat (Codex ↔ Claude)
bun agent:chat send --from codex --to claude --kind handoff --body-file /path/message.md [--reply-to ID]
bun agent:chat read --as codex [--unread] [--last 20]
bun agent:chat ack --as codex --id ID
bun agent:chat status
bun agent:chat wait --as codex [--timeout 45]
Optional --file /absolute/chat.md for an isolated conversation or test.
Read does not acknowledge; ack means read, never acceptance. Times: Africa/Lagos.`

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === "help" || command === "--help") {
    console.log(help)
    return
  }
  const options = new Map<string, string>()
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (
      !name ||
      ![
        "--from",
        "--to",
        "--as",
        "--kind",
        "--body-file",
        "--body",
        "--reply-to",
        "--id",
        "--file",
        "--unread",
        "--last",
        "--timeout",
      ].includes(name ?? "")
    )
      throw new Error(`Unknown option: ${name}`)
    if (options.has(name)) throw new Error(`Duplicate option: ${name}`)
    if (name === "--unread") {
      options.set(name, "true")
      continue
    }
    const value = args[++i]
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value: ${name}`)
    options.set(name, value)
  }
  const file = resolve(
    options.get("--file") ??
      fileURLToPath(new URL("../AGENT_CHAT.md", import.meta.url)),
  )
  const identity = (key: string): Agent => {
    const value = options.get(key)
    if (value !== "codex" && value !== "claude")
      throw new Error(`${key} must be codex or claude`)
    return value
  }
  if (command === "send") {
    const to = options.get("--to")
    if (to !== "codex" && to !== "claude" && to !== "all")
      throw new Error("--to must be codex, claude or all")
    const kind = options.get("--kind") ?? "message"
    if (
      kind !== "message" &&
      kind !== "handoff" &&
      kind !== "review" &&
      kind !== "status"
    )
      throw new Error("Invalid --kind")
    if (options.has("--body") === options.has("--body-file"))
      throw new Error("Provide exactly one of --body or --body-file")
    const bodyFile = options.get("--body-file")
    const body =
      bodyFile !== undefined
        ? await readFile(bodyFile, "utf8")
        : (options.get("--body") ?? "")
    const entry = await postChat(file, {
      from: identity("--from"),
      to,
      kind,
      replyTo: options.get("--reply-to"),
      body,
    })
    console.log(displayEntry(entry))
    return
  }
  if (command === "ack") {
    const id = options.get("--id")
    if (!id) throw new Error("--id is required")
    console.log(displayEntry(await acknowledgeChat(file, identity("--as"), id)))
    return
  }
  if (command === "status") {
    const entries = await readChat(file)
    console.log(
      JSON.stringify(
        {
          file,
          entries: entries.length,
          unread: {
            codex: inbox(entries, "codex", true).length,
            claude: inbox(entries, "claude", true).length,
          },
        },
        null,
        2,
      ),
    )
    return
  }
  if (command !== "read" && command !== "wait")
    throw new Error(`Unknown command: ${command}`)
  const as = identity("--as")
  const last = Number(options.get("--last") ?? 20)
  if (!Number.isInteger(last) || last < 1 || last > 100)
    throw new Error("--last must be 1–100")
  const timeout =
    command === "wait" ? Number(options.get("--timeout") ?? 45) : 0
  if (!Number.isFinite(timeout) || timeout < 0 || timeout > 55)
    throw new Error("--timeout must be 0–55 seconds")
  const deadline = Date.now() + timeout * 1000
  while (true) {
    const entries = await readChat(file)
    const messages = inbox(
      entries,
      as,
      command === "wait" || options.has("--unread"),
    )
    if (messages.length || Date.now() >= deadline) {
      console.log(
        messages.length
          ? (command === "wait" || options.has("--unread")
              ? messages.slice(0, last)
              : messages.slice(-last)
            )
              .map(displayEntry)
              .join("\n\n---\n\n")
          : `No ${command === "wait" || options.has("--unread") ? "unread " : ""}messages for ${as}.`,
      )
      if (messages.length > last)
        console.log(
          command === "wait" || options.has("--unread")
            ? `Showing first ${last} of ${messages.length} unread messages; acknowledge reviewed IDs, then read again.`
            : `Showing last ${last} of ${messages.length}; use --unread to work through outstanding messages.`,
        )
      return
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
