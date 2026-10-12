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
