import { describe, expect, test } from "bun:test"
import { createExpenseReceiptCommands } from "./expense-receipt-commands"
import { readExpenseReceiptPickedFile } from "./expense-receipt-picked-file"
import { createExpenseReceiptTransport } from "./expense-receipt-transport"

const scope = {
  actorUserId: "owner",
  tenantId: "tenant",
  bookId: "book",
  billId: "bill",
}
function memory() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: async (key: string) => {
      values.delete(key)
    },
  }
}
const noop = () => undefined

describe("native receipt command recovery", () => {
  test("an uncertain intent/attachment/withdrawal keeps the same ID across reconstruction and isolates source", async () => {
    const storage = memory()
    let sequence = 0
    const create = (source = scope) =>
      createExpenseReceiptCommands(
        source,
        storage,
        () => `command-${++sequence}`,
        noop,
      )
    for (const operation of ["intent", "attach", "withdraw"] as const) {
      const original = await create().command(operation, "opaque-file-digest")
      expect(await create().command(operation, "opaque-file-digest")).toBe(
        original,
      )
      expect(
        await create({ ...scope, billId: "other" }).command(
          operation,
          "opaque-file-digest",
        ),
      ).not.toBe(original)
      expect(
        await create({ ...scope, actorUserId: "other" }).command(
          operation,
          "opaque-file-digest",
        ),
      ).not.toBe(original)
    }
    expect(
      [...storage.values.values()].every((value) =>
        value.startsWith("command-"),
      ),
    ).toBe(true)
  })
  test("confirmed attachment clears only its linked original, allowing a later intentional replacement", async () => {
    const storage = memory()
    let sequence = 0
    const commands = createExpenseReceiptCommands(
      scope,
      storage,
      () => `command-${++sequence}`,
      noop,
    )
    const original = await commands.command("intent", "first")
    const other = await commands.command("intent", "other")
    await commands.bind("asset", "first")
    await commands.command("attach", "asset")
    await commands.complete("attach", "asset")
    expect(await commands.command("intent", "first")).not.toBe(original)
    expect(await commands.command("intent", "other")).toBe(other)
    expect([...storage.values.values()]).not.toContain("asset")
  })
  test("storage failure, corrupt identities and a scope change cannot send a command", async () => {
    const storage = memory()
    storage.setItem = async () => undefined
    await expect(
      createExpenseReceiptCommands(
        scope,
        storage,
        () => "command-1",
        noop,
      ).command("intent", "file"),
    ).rejects.toThrow("Nothing was sent")
    storage.getItem = async () => "corrupt"
    await expect(
      createExpenseReceiptCommands(
        scope,
        storage,
        () => "command-1",
        noop,
      ).command("intent", "file"),
    ).rejects.toThrow("unreadable")
    let valid = true
    storage.getItem = async () => {
      valid = false
      return null
    }
    await expect(
      createExpenseReceiptCommands(
        scope,
        storage,
        () => "command-1",
        () => {
          if (!valid) throw new Error("scope retired")
        },
      ).command("intent", "file"),
    ).rejects.toThrow("scope retired")
  })
})

describe("native picker originals", () => {
  function picked() {
    let reads = 0
    let deletions = 0
    const local = {
      uri: "file:///cache/DocumentPicker/original.pdf",
      size: 3,
      exists: true,
      bytes: async () => {
        reads++
        return new Uint8Array([1, 2, 3])
      },
      delete: () => {
        deletions++
      },
    }
    return {
      local,
      reads: () => reads,
      deletions: () => deletions,
      input: {
        asset: {
          uri: local.uri,
          name: "original.pdf",
          size: 3,
          mimeType: "application/pdf",
        },
        web: false,
        cacheUri: "file:///cache/",
        openFile: () => local,
        assertCurrent: noop,
      },
    }
  }
  test("valid originals retain exact bytes in memory and remove the owned picker copy", async () => {
    const fixture = picked()
    const result = await readExpenseReceiptPickedFile(fixture.input)
    expect([...result.bytes]).toEqual([1, 2, 3])
    expect(result.contentType).toBe("application/pdf")
    expect(fixture.reads()).toBe(1)
    expect(fixture.deletions()).toBe(1)
  })
  test("physical byte limit and changed size refuse before allocation; foreign originals are never removed", async () => {
    for (const size of [0, 10_000_001]) {
      const fixture = picked()
      fixture.local.size = size
      await expect(readExpenseReceiptPickedFile(fixture.input)).rejects.toThrow(
        "10 MB",
      )
      expect(fixture.reads()).toBe(0)
      expect(fixture.deletions()).toBe(1)
    }
    const fixture = picked()
    fixture.local.uri = "file:///documents/keep.pdf"
    fixture.input.asset.size = 2
    await expect(readExpenseReceiptPickedFile(fixture.input)).rejects.toThrow(
      "changed",
    )
    expect(fixture.deletions()).toBe(0)
  })
  test("retired picker and async read dispose only their cache copy and cannot expose bytes", async () => {
    const fixture = picked()
    fixture.input.assertCurrent = () => {
      throw new Error("retired")
    }
    await expect(readExpenseReceiptPickedFile(fixture.input)).rejects.toThrow(
      "retired",
    )
    expect(fixture.deletions()).toBe(1)
    expect(fixture.reads()).toBe(0)
    const late = picked()
    let valid = true
    late.input.assertCurrent = () => {
      if (!valid) throw new Error("retired")
    }
    late.local.bytes = async () => {
      valid = false
      return new Uint8Array([1, 2, 3])
    }
    await expect(readExpenseReceiptPickedFile(late.input)).rejects.toThrow(
      "retired",
    )
    expect(late.deletions()).toBe(1)
  })
  test("web picker uses the actual File byte size, validates names and never touches a native file", async () => {
    const fixture = picked()
    const result = await readExpenseReceiptPickedFile({
      ...fixture.input,
      web: true,
      asset: {
        ...fixture.input.asset,
        file: {
          size: 3,
          type: "application/pdf",
          arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
        },
      },
      openFile: () => {
        throw new Error("must not open")
      },
    })
    expect([...result.bytes]).toEqual([4, 5, 6])
    fixture.input.asset.name = "../bad.pdf"
    await expect(readExpenseReceiptPickedFile(fixture.input)).rejects.toThrow(
      "valid file name",
    )
  })
})

describe("native protected original transport", () => {
  const source = { bookId: "book", billId: "bill", assetId: "asset" }
  function transport(replies: Response[], guard = noop) {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const adapter = createExpenseReceiptTransport({
      baseUrl: "https://api.invalid",
      assertCurrent: guard,
      headers: {
        "x-app-authorization": "Bearer owned-session",
        "x-tenant-slug": "owned-tenant",
      },
      fetch: async (input, init) => {
        calls.push({ url: String(input), init })
        const response = replies.shift()
        if (!response) throw new Error("unexpected request")
        return response
      },
    })
    return { adapter, calls }
  }
  const grant = () =>
    Response.json({
      token: "single-use-secret",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })
  const original = (body: number[] = [1, 2, 3]) =>
    new Response(new Uint8Array(body), {
      headers: {
        "content-type": "application/pdf",
        "content-length": "3",
        "content-disposition": 'attachment; filename="receipt-asset.pdf"',
      },
    })
  test("exact-byte upload uses the authenticated scope and rejects an unrelated result ID", async () => {
    const fixture = transport([
      Response.json({ id: "other", uploadState: "VERIFIED" }),
    ])
    await expect(
      fixture.adapter.upload(
        source,
        new Uint8Array([1, 2, 3]),
        "application/pdf",
        new AbortController().signal,
      ),
    ).rejects.toThrow("could not be confirmed")
    expect(fixture.calls[0]?.url).toEndWith(
      "/asset/upload?bookId=book&billId=bill",
    )
    expect(fixture.calls[0]?.init?.headers).toEqual({
      "x-app-authorization": "Bearer owned-session",
      "x-tenant-slug": "owned-tenant",
      "Content-Type": "application/pdf",
    })
    expect([
      ...new Uint8Array(fixture.calls[0]?.init?.body as ArrayBuffer),
    ]).toEqual([1, 2, 3])
    expect(fixture.calls[0]?.init?.redirect).toBe("error")
  })
  test("download grants stay in headers, exact private bytes and safe filename reach the saver", async () => {
    const fixture = transport([grant(), original()])
    const result = await fixture.adapter.download(
      source,
      "application/pdf",
      3,
      new AbortController().signal,
    )
    expect([...result.bytes]).toEqual([1, 2, 3])
    expect(result.filename).toBe("receipt-asset.pdf")
    expect(fixture.calls).toHaveLength(2)
    expect(fixture.calls[1]?.init?.headers).toEqual({
      "x-app-authorization": "Bearer owned-session",
      "x-tenant-slug": "owned-tenant",
      "X-Receipt-Download-Token": "single-use-secret",
    })
    expect(fixture.calls.every((call) => !call.url.includes("secret"))).toBe(
      true,
    )
  })
  test("untrusted type/name/length, oversize streams, short reads and expired grants fail closed", async () => {
    for (const header of [
      "content-type",
      "content-disposition",
      "content-length",
    ]) {
      const response = original()
      response.headers.set(header, "wrong")
      const fixture = transport([grant(), response])
      await expect(
        fixture.adapter.download(
          source,
          "application/pdf",
          3,
          new AbortController().signal,
        ),
      ).rejects.toThrow("could not be verified")
    }
    for (const bytes of [
      [1, 2],
      [1, 2, 3, 4],
    ]) {
      const fixture = transport([grant(), original(bytes)])
      await expect(
        fixture.adapter.download(
          source,
          "application/pdf",
          3,
          new AbortController().signal,
        ),
      ).rejects.toThrow()
    }
    const fixture = transport([
      Response.json({ token: "expired", expiresAt: "2000-01-01" }),
    ])
    await expect(
      fixture.adapter.download(
        source,
        "application/pdf",
        3,
        new AbortController().signal,
      ),
    ).rejects.toThrow("grant")
    expect(fixture.calls).toHaveLength(1)
  })
  test("retired authority after grant cannot fetch the original", async () => {
    let checks = 0
    const fixture = transport([grant(), original()], () => {
      if (++checks === 3) throw new Error("retired")
    })
    await expect(
      fixture.adapter.download(
        source,
        "application/pdf",
        3,
        new AbortController().signal,
      ),
    ).rejects.toThrow("retired")
    expect(fixture.calls).toHaveLength(1)
  })
  test("native AbortSignal without throwIfAborted still downloads and refuses an aborted action", async () => {
    const active = new AbortController()
    Object.defineProperty(active.signal, "throwIfAborted", { value: undefined })
    const fixture = transport([grant(), original()])
    expect(
      (
        await fixture.adapter.download(
          source,
          "application/pdf",
          3,
          active.signal,
        )
      ).bytes.length,
    ).toBe(3)
    active.abort()
    const cancelled = transport([grant()])
    await expect(
      cancelled.adapter.download(source, "application/pdf", 3, active.signal),
    ).rejects.toThrow("cancelled")
    expect(cancelled.calls).toHaveLength(0)
  })
})
