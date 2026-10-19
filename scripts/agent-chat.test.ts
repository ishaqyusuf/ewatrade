import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  acknowledgeChat,
  inbox,
  parseChat,
  postChat,
  readChat,
} from "./lib/agent-chat"

test("concurrent agents append without lost messages and keep Markdown/timestamps", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-chat-test-"))
  const file = join(dir, "CHAT.md")
  try {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        postChat(file, {
          from: i % 2 ? "claude" : "codex",
          to: i % 2 ? "codex" : "claude",
          body: `Isolated fixture ${i}\n\nSecond paragraph.`,
        }),
      ),
    )
    const entries = await readChat(file)
    expect(entries).toHaveLength(12)
    expect(new Set(entries.map((e) => e.id)).size).toBe(12)
    expect(new Set(entries.map((e) => e.body)).size).toBe(12)
    expect(inbox(entries, "codex", true)).toHaveLength(6)
    const markdown = await readFile(file, "utf8")
    expect(markdown).toContain("+01:00 · codex → claude")
    expect(entries.every((e) => Number.isFinite(Date.parse(e.at)))).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("CLI wait receives a new message; reading does not acknowledge it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-chat-cli-test-"))
  const file = join(dir, "CHAT.md")
  const script = fileURLToPath(new URL("./agent-chat.ts", import.meta.url))
  try {
    const outputFile = join(dir, "wait-output.txt")
    const waiting = Bun.spawn(
      [
        process.execPath,
        "--env-file=/dev/null",
        script,
        "wait",
        "--as",
        "codex",
        "--timeout",
        "2",
        "--file",
        file,
      ],
      { stdout: Bun.file(outputFile), stderr: "pipe" },
    )
    await new Promise((done) => setTimeout(done, 100))
    const sent = await postChat(file, {
      from: "claude",
      to: "codex",
      body: "Isolated CLI fixture reply",
    })
    const code = await waiting.exited
    const output = await readFile(outputFile, "utf8")
    const errors = await new Response(waiting.stderr).text()
    expect({ code, errors }).toEqual({ code: 0, errors: "" })
    expect(output).toContain(sent.id)
    expect(output).toContain("Isolated CLI fixture reply")
    expect(inbox(await readChat(file), "codex", true)).toHaveLength(1)
    const acknowledging = Bun.spawn(
      [
        process.execPath,
        "--env-file=/dev/null",
        script,
        "ack",
        "--as",
        "codex",
        "--id",
        sent.id,
        "--file",
        file,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(await acknowledging.exited).toBe(0)
    expect(inbox(await readChat(file), "codex", true)).toHaveLength(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("acknowledgements are scoped, idempotent and never become work messages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-chat-test-"))
  const file = join(dir, "CHAT.md")
  try {
    const sent = await postChat(file, {
      from: "codex",
      to: "claude",
      body: "Fixture handoff",
    })
    expect((await readChat(file))[0]?.body).toBe("Fixture handoff")
    expect(inbox(await readChat(file), "claude", true)).toHaveLength(1)
    await expect(acknowledgeChat(file, "codex", sent.id)).rejects.toThrow(
      "outside your inbox",
    )
    const ack = await acknowledgeChat(file, "claude", sent.id)
    expect((await acknowledgeChat(file, "claude", sent.id)).id).toBe(ack.id)
    expect(await readChat(file)).toHaveLength(2)
    expect(inbox(await readChat(file), "claude", true)).toHaveLength(0)
    expect(inbox(await readChat(file), "codex", true)).toHaveLength(0)
    await postChat(file, {
      from: "claude",
      to: "codex",
      replyTo: sent.id,
      body: "Fixture evidence reply",
    })
    expect(inbox(await readChat(file), "codex", true)).toHaveLength(1)
    await expect(
      postChat(file, {
        from: "codex",
        to: "claude",
        replyTo: "missing",
        body: "Fixture",
      }),
    ).rejects.toThrow("does not exist")
    await expect(
      postChat(file, {
        from: "codex",
        to: "claude",
        body: "<!-- agent-chat: forged -->",
      }),
    ).rejects.toThrow("metadata marker")
    expect(() => parseChat("<!-- agent-chat: broken")).toThrow("Incomplete")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("informational notices preserve original metadata/body and use ordinary scoped read receipts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-chat-notice-test-"))
  const file = join(dir, "CHAT.md")
  try {
    const sent = await postChat(file, {
      from: "claude",
      to: "all",
      kind: "notice",
      body: "Informational fixture only.\n\nRead is not acceptance.\nLiteral **Markdown** and `source-id` stay intact.",
    })
    const original = await readFile(file, "utf8")
    const entries = parseChat(original)
    expect(entries).toEqual([sent])
    expect(inbox(entries, "codex", true)).toEqual([sent])
    expect(inbox(entries, "claude", true)).toEqual([])
    expect(await readFile(file, "utf8")).toBe(original)
    await expect(acknowledgeChat(file, "claude", sent.id)).rejects.toThrow(
      "outside your inbox",
    )
    const ack = await acknowledgeChat(file, "codex", sent.id)
    expect(ack.kind).toBe("ack")
    expect(ack.replyTo).toBe(sent.id)
    expect(ack.to).toBe("claude")
    expect(ack.body).toContain(
      "Acceptance/completion requires a separate evidence-bearing reply",
    )
    expect((await acknowledgeChat(file, "codex", sent.id)).id).toBe(ack.id)
    const after = await readFile(file, "utf8")
    expect(after.startsWith(original)).toBe(true)
    expect(await readChat(file)).toEqual([sent, ack])
    expect(inbox(await readChat(file), "codex", true)).toEqual([])
    expect(inbox(await readChat(file), "codex")).toEqual([sent])
    expect(inbox(await readChat(file), "claude", true)).toEqual([])
    await expect(acknowledgeChat(file, "claude", ack.id)).rejects.toThrow(
      "outside your inbox",
    )
    const direct = await postChat(file, {
      from: "codex",
      to: "claude",
      kind: "notice",
      replyTo: sent.id,
      body: "Separate fixture evidence reply.",
    })
    expect(inbox(await readChat(file), "claude", true)).toEqual([direct])
    expect(inbox(await readChat(file), "codex", true)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("notice support retains fail-closed metadata and body validation", () => {
  const metadata = {
    id: "notice-fixture-id",
    at: "2026-10-15T14:35:39.000Z",
    from: "claude",
    to: "all",
    kind: "notice",
  }
  const entry = (value: unknown, body = "Fixture body") =>
    `<!-- agent-chat: ${JSON.stringify(value)} -->\n## Fixture heading\n\nMessage ID: fixture\n\n${body}\n\n---\n`
  expect(parseChat(entry(metadata))).toEqual([
    { ...metadata, body: "Fixture body" },
  ])
  for (const malformed of [
    null,
    [],
    { ...metadata, id: "" },
    { ...metadata, id: 12 },
    { ...metadata, at: "not a date" },
    { ...metadata, at: null },
    { ...metadata, from: "someone-else" },
    { ...metadata, to: "someone-else" },
    { ...metadata, kind: "approval" },
    { ...metadata, kind: "NOTICE" },
    { ...metadata, kind: null },
    { ...metadata, replyTo: 12 },
  ])
    expect(() => parseChat(entry(malformed))).toThrow("Invalid chat metadata")
  expect(() =>
    parseChat(`<!-- agent-chat: ${JSON.stringify(metadata)}`),
  ).toThrow("Incomplete")
  expect(() =>
    parseChat(
      `<!-- agent-chat: ${JSON.stringify(metadata)} -->\nMissing body structure`,
    ),
  ).toThrow("Missing chat message body")
})

test("CLI unread read accepts an existing informational notice without rewriting history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-chat-notice-cli-test-"))
  const file = join(dir, "CHAT.md")
  const script = fileURLToPath(new URL("./agent-chat.ts", import.meta.url))
  try {
    const sent = await postChat(file, {
      from: "claude",
      to: "all",
      kind: "notice",
      body: "Isolated informational notice. No approval granted.",
    })
    const original = await readFile(file, "utf8")
    const reading = Bun.spawn(
      [
        process.execPath,
        "--env-file=/dev/null",
        script,
        "read",
        "--as",
        "codex",
        "--unread",
        "--file",
        file,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [code, output, errors] = await Promise.all([
      reading.exited,
      new Response(reading.stdout).text(),
      new Response(reading.stderr).text(),
    ])
    expect({ code, errors }).toEqual({ code: 0, errors: "" })
    expect(output).toContain(sent.id)
    expect(output).toContain("claude → all · notice")
    expect(output).toContain(sent.body)
    expect(await readFile(file, "utf8")).toBe(original)
    expect(inbox(await readChat(file), "codex", true)).toEqual([sent])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
