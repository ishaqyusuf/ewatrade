import { expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { renderToStaticMarkup } from "react-dom/server"
import {
  CustodyFormView,
  custodyEditorScope,
  custodyStaffChoices,
} from "./general-stock-custody-editor"

// Source/unit evidence only: static render of what the editor offers, says
// and allows for a given fresh read. Not browser acceptance.
const draft = {
  action: "stock_custody_move" as const,
  sourceBalanceSourceId: "store-eggs",
  target: { type: "staff" as const, userId: "amina-1" },
  quantity: "5",
  reason: "Delivery round",
}
const people = [
  { id: "amina-1", name: "Amina" },
  // Same display name, different saved identity.
  { id: "amina-2", name: "Amina" },
  { id: "bola", name: "Bola" },
]
function render(
  read: "loading" | "ready" | "unavailable",
  options: {
    optionsStoreId?: string
    assignees?: typeof people
    selected?: string
  } = {},
) {
  const selected = options.selected ?? "amina-1"
  const choices = custodyStaffChoices({
    read,
    activeStoreId: "store-a",
    optionsStoreId: options.optionsStoreId ?? "store-a",
    assignees: options.assignees ?? people,
    selected,
  })
  const html = renderToStaticMarkup(
    <CustodyFormView
      payload={{ ...draft, target: { type: "staff", userId: selected } }}
      assigning
      choices={choices}
      disabled={false}
      error={null}
      onChange={() => {}}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  )
  const saveDisabled = /<button[^>]*type="submit"[^>]*\sdisabled=""/.test(html)
  return { choices, html, saveDisabled }
}

test("an eligible drafted identity is offered and can be saved", () => {
  const { choices, html, saveDisabled } = render("ready")
  expect(choices).toMatchObject({ status: "ready", selectedEligible: true })
  expect(html).not.toContain("can't hold stock in this Store now")
  expect(saveDisabled).toBe(false)
})

test("same-name staff stay distinct identities", () => {
  const first = render("ready", { selected: "amina-1" }).choices
  const second = render("ready", { selected: "amina-2" }).choices
  expect(first.people.map((person) => person.id)).toEqual([
    "amina-1",
    "amina-2",
    "bola",
  ])
  expect(first.selectedEligible && second.selectedEligible).toBe(true)
  // An identity that only shares a name is not eligible.
  expect(
    render("ready", { selected: "amina-3" }).choices.selectedEligible,
  ).toBe(false)
})

test("a revoked or absent drafted identity is not offered and blocks save", () => {
  const { choices, html, saveDisabled } = render("ready", {
    assignees: people.filter((person) => person.id !== "amina-1"),
  })
  expect(choices.people.some((person) => person.id === "amina-1")).toBe(false)
  expect(choices.selectedEligible).toBe(false)
  expect(html).toContain("The drafted staff member can")
  expect(html).not.toContain("Drafted staff member")
  expect(saveDisabled).toBe(true)
})

test("an old cached list for another Store is never offered", () => {
  const { choices, html, saveDisabled } = render("ready", {
    optionsStoreId: "store-b",
  })
  expect(choices).toEqual({
    status: "unavailable",
    people: [],
    selectedEligible: false,
  })
  expect(html).toContain("Staff for this Store are unavailable")
  expect(html).not.toContain("Bola")
  expect(saveDisabled).toBe(true)
})

test("loading, error and empty lists offer nobody and block save", () => {
  const loading = render("loading")
  expect(loading.html).toContain("Loading staff who can hold stock")
  expect(loading.saveDisabled).toBe(true)
  const failed = render("unavailable")
  expect(failed.html).toContain("Staff for this Store are unavailable")
  expect(failed.saveDisabled).toBe(true)
  const empty = render("ready", { assignees: [] })
  expect(empty.choices.status).toBe("empty")
  expect(empty.html).toContain("No staff can hold stock in this Store.")
  expect(empty.saveDisabled).toBe(true)
})

test("a Tenant, Store or member change gives the form a new identity", () => {
  const base = {
    tenant: { id: "tenant-a" },
    activeStore: { id: "store-a" },
    membership: { id: "m-1" },
  }
  const key = custodyEditorScope(base)
  for (const changed of [
    { ...base, tenant: { id: "tenant-b" } },
    { ...base, activeStore: { id: "store-b" } },
    { ...base, membership: { id: "m-2" } },
    { ...base, activeStore: null },
  ])
    expect(custodyEditorScope(changed)).not.toBe(key)
  expect(custodyEditorScope(base)).toBe(key)
})

test("a return needs no staff choice and can be saved", () => {
  const html = renderToStaticMarkup(
    <CustodyFormView
      payload={{ ...draft, target: { type: "store" } }}
      assigning={false}
      choices={custodyStaffChoices({
        read: "loading",
        activeStoreId: "store-a",
        optionsStoreId: undefined,
        assignees: undefined,
        selected: "",
      })}
      disabled={false}
      error={null}
      onChange={() => {}}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  )
  expect(html).toContain("Quantity to return")
  expect(html).not.toContain("Staff member")
  expect(/<button[^>]*type="submit"[^>]*\sdisabled=""/.test(html)).toBe(false)
})

// Real SDK wiring: actual tRPC options proxy and client with a local link (no
// HTTP, server or database) and real QueryObservers over the editor's reads.
async function wiring() {
  const { QueryClient, QueryObserver } = await import("@tanstack/react-query")
  const { createTRPCClient } = await import("@trpc/client")
  const { observable } = await import("@trpc/server/observable")
  const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
  const { freshShownRead, nextReadMount } = await import(
    "@ewatrade/assistant/general/staff-activity-target"
  )
  const editor = await import("./general-stock-custody-editor")
  const state = {
    eligible: [
      { id: "amina-1", name: "Amina" },
      { id: "bola", name: "Bola" },
    ],
    storeId: "store-a",
  }
  const calls: Array<{
    path: string
    input: unknown
    signal: AbortSignal | null | undefined
    eligible: string[]
  }> = []
  const pending: Array<() => void> = []
  const queryClient = new QueryClient()
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              // The answer is fixed when the request starts, like a server
              // reading authority at that moment.
              const answer =
                op.path === "tenant.current"
                  ? {
                      tenant: { id: "tenant-a" },
                      activeStore: { id: state.storeId },
                      membership: { id: "m-1" },
                    }
                  : { storeId: state.storeId, assignees: [...state.eligible] }
              calls.push({
                path: op.path,
                input: op.input,
                signal: op.signal,
                eligible: state.eligible.map((person) => person.id),
              })
              pending.push(() => {
                observer.next({ result: { type: "data", data: answer } })
                observer.complete()
              })
            }),
      ],
    }),
    queryClient,
  })
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  const settle = async () => {
    for (const resolve of pending.splice(0)) resolve()
    await tick()
  }
  return {
    QueryObserver,
    queryClient,
    trpc,
    calls,
    state,
    tick,
    settle,
    freshShownRead,
    nextReadMount,
    editor,
  }
}

test("a pending staff read closed before revocation never answers the reopened editor", async () => {
  const w = await wiring()
  const open = () =>
    new w.QueryObserver(
      w.queryClient,
      w.editor.custodyOptionsRead(w.trpc, w.nextReadMount(), true),
    )
  const first = open()
  const closeFirst = first.subscribe(() => {})
  await w.tick()
  expect(w.calls).toHaveLength(1)
  closeFirst()
  expect(w.calls[0]?.signal?.aborted).toBe(true)
  // Amina loses Store access; the editor reopens on the same draft.
  w.state.eligible = [{ id: "bola", name: "Bola" }]
  const reopened = open()
  const closeReopened = reopened.subscribe(() => {})
  await w.tick()
  expect(w.freshShownRead(reopened.getCurrentResult()).state).toBe("checking")
  await w.settle()
  expect(w.calls.map((call) => call.eligible)).toEqual([
    ["amina-1", "bola"],
    ["bola"],
  ])
  expect(w.calls[1]).toMatchObject({
    path: "serviceAssistantIntake.options",
    input: {},
  })
  const read = w.freshShownRead(reopened.getCurrentResult())
  if (read.state !== "ready") throw Error("expected a fresh list")
  const choices = custodyStaffChoices({
    read: "ready",
    activeStoreId: "store-a",
    optionsStoreId: read.data.storeId,
    assignees: read.data.assignees,
    selected: "amina-1",
  })
  expect(choices.selectedEligible).toBe(false)
  expect(choices.people.map((person) => person.id)).toEqual(["bola"])
  closeReopened()
  w.queryClient.clear()
})

test("a same-Store staff change during an open editor blocks choices until the new list arrives", async () => {
  const w = await wiring()
  const observer = new w.QueryObserver(
    w.queryClient,
    w.editor.custodyOptionsRead(w.trpc, w.nextReadMount(), true),
  )
  const close = observer.subscribe(() => {})
  await w.tick()
  await w.settle()
  expect(w.freshShownRead(observer.getCurrentResult()).state).toBe("ready")
  w.state.eligible = [{ id: "bola", name: "Bola" }]
  const refetch = observer.refetch()
  await w.tick()
  // The earlier list is cached but a fresh read is in flight: nothing offered.
  expect(w.freshShownRead(observer.getCurrentResult())).toEqual({
    state: "checking",
  })
  await w.settle()
  await refetch
  const read = w.freshShownRead(observer.getCurrentResult())
  expect(read.state === "ready" && read.data.assignees).toEqual([
    { id: "bola", name: "Bola" },
  ])
  close()
  w.queryClient.clear()
})

test("a cached Store context that is refetching is not treated as current", async () => {
  const w = await wiring()
  const observer = new w.QueryObserver(
    w.queryClient,
    w.editor.custodyContextRead(w.trpc, w.nextReadMount()),
  )
  const close = observer.subscribe(() => {})
  await w.tick()
  await w.settle()
  expect(w.freshShownRead(observer.getCurrentResult()).state).toBe("ready")
  w.state.storeId = "store-b"
  void observer.refetch()
  await w.tick()
  expect(w.freshShownRead(observer.getCurrentResult()).state).toBe("checking")
  await w.settle()
  const read = w.freshShownRead(observer.getCurrentResult())
  expect(read.state === "ready" && read.data.activeStore?.id).toBe("store-b")
  expect(w.calls.every((call) => call.path === "tenant.current")).toBe(true)
  close()
  w.queryClient.clear()
})
