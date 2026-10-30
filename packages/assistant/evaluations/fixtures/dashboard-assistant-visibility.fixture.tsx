import { afterEach, expect, mock, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { DOMImplementation } from "@xmldom/xmldom"
import {
  type ComponentProps,
  type ReactNode,
  act,
  useCallback,
  useEffect,
  useState,
} from "react"

// Real panel, GeneralChat, answer card, record reader, composer and query observers.
// Only RPC, SDK
// streaming, recorder and heavy presentation boundaries are inert. No network,
// provider, database, storage, business command or authenticated browser runs.
const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  HTMLIFrameElement: class {},
  HTMLElement: class {},
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: true }),
  location: { origin: "https://example.invalid" },
}
Object.assign(globalThis, {
  window,
  document,
  IS_REACT_ACT_ENVIRONMENT: true,
  getComputedStyle: () => ({
    lineHeight: "20",
    paddingTop: "0",
    paddingBottom: "0",
  }),
})
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
const create = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(create(name), {
    style: {},
    focus() {},
    addEventListener() {},
    removeEventListener() {},
  })
const body = document.createElement("body")
document.documentElement?.appendChild(body)
Object.assign(document, { body })
const text = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = text(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
// Import after window: actual QueryObserver must use browser polling semantics.
const { QueryClientProvider, focusManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
focusManager.setFocused(true)
const realInterval = globalThis.setInterval
// Accelerate only the production 60s/15s optional polls, preserving observers.
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) =>
  realInterval(
    callback,
    delay === 60_000 || delay === 15_000 ? 15 : delay,
    ...args,
  )) as typeof setInterval

const app = (name: string) =>
  new URL(`../../../../apps/dashboard/src/${name}`, import.meta.url).pathname
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
const Button = ({
  children,
  onClick,
  disabled,
  ...props
}: ComponentProps<"button">) => (
  <button
    type={props.type ?? "button"}
    disabled={disabled}
    onClick={onClick}
    aria-label={props["aria-label"]}
  >
    {children}
  </button>
)
mock.module("@ewatrade/ui", () => ({
  Button,
  buttonVariants: () => "",
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  ...Object.fromEntries(
    [
      "Dialog",
      "DialogContent",
      "DialogDescription",
      "DialogHeader",
      "DialogTitle",
      "DropdownMenu",
      "DropdownMenuContent",
      "DropdownMenuGroup",
      "DropdownMenuItem",
      "DropdownMenuLabel",
      "DropdownMenuSeparator",
      "DropdownMenuTrigger",
    ].map((name) => [name, leaf]),
  ),
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
mock.module("next/dist/client/components/error-boundary", () => ({
  ErrorBoundary: leaf,
}))
mock.module(app("components/dashboard/workspace-error"), () => ({
  WorkspaceError: () => null,
}))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
mock.module("streamdown", () => ({ Streamdown: leaf }))
mock.module("use-stick-to-bottom", () => ({
  StickToBottom: Object.assign(leaf, { Content: leaf }),
}))
mock.module(app("components/page-fab/fab-slot"), () => ({
  useAssistantDraftRequests() {},
}))
mock.module("@ewatrade/events/dashboard-client", () => ({
  useDashboardWorkflow: () => ({ track() {} }),
}))
mock.module(app("hooks/use-assistant-receipt"), () => ({
  useAssistantReceipt: () => () => {},
}))
mock.module(app("hooks/use-assistant-draft-job-handoff"), () => ({
  AssistantDraftJobHandoffProvider: leaf,
  useAssistantDraftJobHandoff: () => ({}),
}))
for (const [name, exports] of [
  ["general-chat-photo", { GeneralSentFile: () => null }],
  [
    "general-proposal-card",
    {
      GeneralOutcomeList: () => null,
      GeneralProposalCard: () => null,
      isGeneralOutcome: () => false,
    },
  ],
  ["general-proposal-editor", { GeneralProposalEditor: () => null }],
  [
    "general-unavailable-proposals",
    { GeneralUnavailableProposals: () => null },
  ],
] as const)
  mock.module(app(`components/general-assistant/${name}`), () => exports)

for (const [path, name] of [
  ["open-assistant-booking-sheet", "OpenAssistantBookingSheet"],
  ["open-assistant-finance-review", "OpenAssistantFinanceReview"],
  ["open-assistant-manual-message-sheet", "OpenAssistantManualMessageSheet"],
  ["open-assistant-quote-approval-sheet", "OpenAssistantQuoteApprovalSheet"],
  ["open-assistant-service-request-sheet", "OpenAssistantServiceRequestSheet"],
  ["open-business-report-sheet", "OpenBusinessReportSheet"],
  ["open-service-work-original-sheet", "OpenServiceWorkOriginalSheet"],
  ["open-staff-access-sheet", "OpenStaffAccessSheet"],
  ["open-staff-activity-sheet", "OpenStaffActivitySheet"],
  ["open-staff-directory-sheet", "OpenStaffDirectorySheet"],
  ["open-staff-history-sheet", "OpenStaffHistorySheet"],
  ["open-staff-invitation-sheet", "OpenStaffInvitationSheet"],
  ["open-staff-member-sheet", "OpenStaffMemberSheet"],
  ["open-staff-status-sheet", "OpenStaffStatusSheet"],
  [
    "general-assistant/general-money-accounts-answer",
    "GeneralMoneyAccountsAnswer",
  ],
  ["general-assistant/general-service-job-card", "GeneralServiceJobCard"],
  ["general-assistant/open-missing-catalog-item", "OpenMissingCatalogItem"],
] as const) {
  mock.module(app(`components/${path}`), () => ({ [name]: () => null }))
}

const noItems: never[] = []
mock.module(app("components/setup-assistant/use-setup-attachments"), () => ({
  useSetupAttachments: () => ({
    items: noItems,
    busy: false,
    add() {},
    remove() {},
  }),
}))
let recorderMounts = 0
let recorderUnmounts = 0
mock.module(app("components/setup-assistant/use-setup-voice-recorder"), () => ({
  formatRecorderElapsed: () => "0:00",
  useSetupVoiceRecorder: () => {
    useState(() => ++recorderMounts)
    useEffect(
      () => () => {
        recorderUnmounts++
      },
      [],
    )
    return {
      state: { kind: "idle" },
      maxDurationMs: 60_000,
      start() {},
      stop() {},
      cancel() {},
      dismiss() {},
    }
  },
}))
let selectedChat: string | null = "chat-a"
const selectChat = async () => {}
mock.module(app("hooks/use-quick-chat-param"), () => ({
  useQuickChatParam: () => [selectedChat, selectChat],
}))
let chatStatus = "ready"
let stops = 0
let sdk: {
  onData?: (part: unknown) => void
  onFinish?: (part: unknown) => void
} = {}
mock.module("@ai-sdk/react", () => ({
  useChat: (options: typeof sdk) => {
    sdk = options
    const [messages, setMessages] = useState<unknown[]>([])
    const stop = useCallback(async () => {
      stops++
    }, [])
    const clearError = useCallback(() => {}, [])
    return {
      messages,
      setMessages,
      status: chatStatus,
      stop,
      clearError,
      error: undefined,
      sendMessage: async () => {},
    }
  },
}))
mock.module("ai", () => ({ DefaultChatTransport: class {} }))
let savedChats: { id: string; title: string; updatedAt: string }[] = [
  { id: "chat-a", title: "Existing", updatedAt: "2026-10-29T00:00:00Z" },
]
let starts = 0
let conversationGate:
  | ReturnType<typeof Promise.withResolvers<typeof savedChats>>
  | undefined
let command: ReturnType<typeof Promise.withResolvers<object>> | undefined
let runStatus = "RUNNING"
const runReads: string[] = []
const originalFetch = globalThis.fetch
globalThis.fetch = Object.assign(
  async (input: Parameters<typeof fetch>[0]) => {
    const path = String(input)
    if (!path.startsWith("/api/assistant/general/runs/"))
      throw Error("Unexpected network boundary")
    runReads.push(path)
    return Response.json({ conversationId: "chat-a", status: runStatus })
  },
  {
    preconnect() {
      throw Error("Unexpected network boundary")
    },
  },
)
const reads: string[] = []
const readFailures = new Map<string, string>()
function endpoint(path: string, get: () => unknown) {
  return {
    queryKey: () => [path],
    pathKey: () => [path],
    queryOptions: (input?: unknown, options?: object) => ({
      queryKey: [path, input],
      queryFn: async () => {
        reads.push(path)
        const code = readFailures.get(path)
        if (code) throw { data: { code } }
        return get()
      },
      ...options,
    }),
  }
}
const trpc = {
  assistant: {
    availability: endpoint("availability", () => ({
      enabled: true,
      media: { files: false, photos: false },
    })),
    conversations: endpoint(
      "conversations",
      () => conversationGate?.promise ?? savedChats,
    ),
    conversation: endpoint("conversation", () => null),
    pendingProposals: endpoint("pending", () => []),
    start: {
      mutationOptions: () => ({
        mutationFn: async () => ({ id: `created-${++starts}` }),
      }),
    },
    decideProposal: {
      mutationOptions: () => ({
        mutationFn: async () => (command ? command.promise : {}),
      }),
    },
    editProposal: { mutationOptions: () => ({ mutationFn: async () => ({}) }) },
  },
  setupAssistant: {
    attachments: {
      voiceCapabilities: endpoint("voice", () => ({ enabled: false })),
    },
  },
}
let recordReads = 0
let recordGeneration = 0
let recordError: string | null = null
let recordStore = "store-a"
type RecordContext = { tenant: { id: string }; activeStore: { id: string } }
let recordGate:
  | ReturnType<typeof Promise.withResolvers<RecordContext>>
  | undefined
let recordAborts = 0
mock.module(app("trpc/client"), () => ({
  useTRPC: () => trpc,
  getDataCacheGeneration: () => recordGeneration,
  useTRPCClient: () => ({
    tenant: {
      current: {
        query: async (_: unknown, options: { signal: AbortSignal }) => {
          recordReads++
          options.signal.addEventListener("abort", () => recordAborts++, {
            once: true,
          })
          if (recordError) throw { data: { code: recordError } }
          return (
            recordGate?.promise ?? {
              tenant: { id: "tenant-a" },
              activeStore: { id: recordStore },
            }
          )
        },
      },
    },
  }),
}))
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
const { useGeneralAssistant: realHook } = await import(
  "../../../../apps/dashboard/src/components/general-assistant/use-general-assistant"
)
let vm: ReturnType<typeof realHook>
mock.module(app("components/general-assistant/use-general-assistant"), () => ({
  useGeneralAssistant: (options: Parameters<typeof realHook>[0]) => {
    vm = realHook(options)
    return vm
  },
}))
const { GeneralChat } = await import(
  "../../../../apps/dashboard/src/components/general-assistant/general-chat"
)
const { QuickAssistantPanel } = await import(
  "../../../../apps/dashboard/src/components/quick-assistant/quick-assistant-panel"
)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function mounted(panel = false) {
  recordReads = 0
  recordGeneration = 0
  recordError = null
  recordStore = "store-a"
  recordGate = undefined
  recordAborts = 0
  reads.length = 0
  readFailures.clear()
  runReads.length = 0
  stops = 0
  starts = 0
  recorderMounts = 0
  recorderUnmounts = 0
  selectedChat = "chat-a"
  chatStatus = "ready"
  runStatus = "RUNNING"
  command = undefined
  conversationGate = undefined
  savedChats = [
    { id: "chat-a", title: "Existing", updatedAt: "2026-10-29T00:00:00Z" },
  ]
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  const client = makeQueryClient()
  client.setDefaultOptions({
    queries: { retry: false, staleTime: 0, gcTime: 0 },
  })
  const render = async (active: boolean) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          {panel ? (
            <QuickAssistantPanel opened={active} onMinimize={() => {}} />
          ) : (
            <GeneralChat active={active} />
          )}
        </QueryClientProvider>,
      )
      await delay(20)
    })
    await act(async () => {
      await delay(20)
    })
  }
  return {
    client,
    render,
    html: () => document.documentElement?.toString() ?? "",
    close: async () => {
      await act(async () => root.unmount())
      client.clear()
      document.documentElement?.removeChild(host)
    },
  }
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

test("minimized retained chat stops idle queries/polls and preserves the draft on reopen", async () => {
  const ui = await mounted()
  cleanups.push(ui.close)
  await ui.render(true)
  expect(reads).toContain("pending")
  expect(reads).toContain("voice")
  await act(async () => {
    vm.setDraft("Unsent draft")
    vm.setReadyAttachments([
      { attachmentId: "ready-a", fileName: "Receipt.pdf" },
    ])
  })
  const mountedRecorders = recorderMounts
  expect(mountedRecorders).toBeGreaterThan(0)
  await ui.render(false)
  const before = [...reads]
  await act(async () => {
    await ui.client.invalidateQueries()
    await delay(45)
  })
  expect(reads).toEqual(before)
  expect(vm.draft).toBe("Unsent draft")
  expect(vm.readyAttachments).toEqual([
    { attachmentId: "ready-a", fileName: "Receipt.pdf" },
  ])
  expect(recorderMounts).toBe(mountedRecorders)
  expect(recorderUnmounts).toBe(0)
  expect(stops).toBe(0)
  await ui.render(true)
  expect(vm.draft).toBe("Unsent draft")
  expect(reads.length).toBeGreaterThan(before.length)
})

test("cached availability cannot auto-start an empty conversation while hidden", async () => {
  const ui = await mounted()
  cleanups.push(ui.close)
  selectedChat = null
  savedChats = []
  ui.client.setQueryData(["availability", undefined], { enabled: true })
  ui.client.setQueryData(["conversations", undefined], [])
  await ui.render(false)
  expect(starts).toBe(0)
  expect(reads).toEqual([])
})

test("a history read finishing after minimize cannot auto-start a conversation", async () => {
  const ui = await mounted()
  cleanups.push(ui.close)
  selectedChat = null
  savedChats = []
  const history = Promise.withResolvers<typeof savedChats>()
  conversationGate = history
  await ui.render(true)
  expect(reads).toContain("conversations")
  await ui.render(false)
  await act(async () => {
    history.resolve([])
    await delay(20)
  })
  expect(starts).toBe(0)
  expect(vm.conversationId).toBeNull()
})

test("a command already pending can finalize while minimized", async () => {
  const ui = await mounted()
  cleanups.push(ui.close)
  await ui.render(true)
  const pendingCommand = Promise.withResolvers<object>()
  command = pendingCommand
  const proposal: Parameters<typeof vm.cancel>[0] = {
    id: "proposal-a",
    revision: 1,
    status: "PENDING",
    receipt: null,
    expiresAt: "2026-10-30T00:00:00Z",
    payload: { action: "customer_create", name: "Inert cancelled draft" },
  }
  let result: Promise<boolean> = Promise.resolve(false)
  await act(async () => {
    result = vm.cancel(proposal)
    await delay(1)
  })
  expect(vm.pending).toBe(true)
  await ui.render(false)
  await act(async () => {
    pendingCommand.resolve({})
    expect(await result).toBe(true)
    await delay(5)
  })
  expect(vm.pending).toBe(false)
  expect(vm.notice).toBeNull()
  expect(reads).toContain("conversation")
  expect(stops).toBe(0)
})

test("a streamed run remains recoverable after minimizing", async () => {
  const ui = await mounted()
  cleanups.push(ui.close)
  await ui.render(true)
  chatStatus = "streaming"
  await ui.render(true)
  await act(async () =>
    sdk.onData?.({ type: "data-general-run", data: { runId: "run-a" } }),
  )
  await ui.render(false)
  expect(stops).toBe(0)
  expect(vm.runId).toBe("run-a")
  chatStatus = "ready"
  runStatus = "COMPLETED"
  await ui.render(false)
  await act(async () => {
    await delay(20)
  })
  expect(runReads).toEqual(["/api/assistant/general/runs/run-a"])
  expect(vm.runId).toBeNull()
  expect(stops).toBe(0)
  const afterRecovery = [...reads]
  await act(async () => {
    await ui.client.invalidateQueries()
    await delay(45)
  })
  expect(reads).toEqual(afterRecovery)
})

const recordAnswer = {
  id: "answer-record",
  title: "Inert catalog result",
  value: "A product",
  detail: "Existing recorded item",
  scope: "Original Store",
  asOf: "2026-10-29T00:00:00.000Z",
  target: {
    kind: "catalog_item",
    catalogItemId: "item-a",
    origin: { tenantId: "tenant-a", storeId: "store-a" },
  },
} satisfies GeneralAnswer
async function showRecord() {
  await act(async () => {
    vm.chat.setMessages([
      {
        id: "message-record",
        role: "assistant",
        parts: [{ type: "data-general-answer", data: recordAnswer }],
      },
    ])
    await delay(20)
  })
  await act(async () => {
    await delay(20)
  })
}

test("actual retained panel and answer-card record stop hidden reads and require fresh scope on reopen", async () => {
  const ui = await mounted(true)
  cleanups.push(ui.close)
  await ui.render(true)
  await showRecord()
  expect(ui.html()).toContain(
    'href="https://example.invalid/sales?catalogDetail=item-a"',
  )
  expect(recordReads).toBeGreaterThan(0)
  await act(async () => vm.setDraft("Retained record draft"))
  await ui.render(false)
  const hiddenReads = recordReads
  await act(async () => {
    await ui.client.invalidateQueries()
    await delay(50)
  })
  expect(recordReads).toBe(hiddenReads)
  expect(ui.html()).toContain("quick-assistant-panel")
  expect(ui.html()).not.toContain(
    'href="https://example.invalid/sales?catalogDetail=item-a"',
  )
  const gate = Promise.withResolvers<RecordContext>()
  recordGate = gate
  recordGeneration++
  await ui.render(true)
  expect(recordReads).toBeGreaterThan(hiddenReads)
  expect(ui.html()).toContain("Checking record access")
  expect(ui.html()).not.toContain(
    'href="https://example.invalid/sales?catalogDetail=item-a"',
  )
  expect(vm.draft).toBe("Retained record draft")
  await act(async () => {
    gate.resolve({ tenant: { id: "tenant-a" }, activeStore: { id: "store-b" } })
    await delay(20)
  })
  expect(ui.html()).not.toContain(
    'href="https://example.invalid/sales?catalogDetail=item-a"',
  )
  expect(ui.html()).toContain("Select the original business")
})

test("record refusals stop intervals, erase payload and recover on focus", async () => {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"]) {
    const ui = await mounted(true)
    try {
      await ui.render(true)
      await showRecord()
      expect(ui.html()).toContain(
        'href="https://example.invalid/sales?catalogDetail=item-a"',
      )
      recordError = code
      await act(async () => {
        await ui.client.invalidateQueries({
          queryKey: ["assistant-read-record-context"],
        })
        await delay(10)
      })
      const refusedReads = recordReads
      expect(
        ui.client.getQueryData([
          "assistant-read-record-context",
          recordGeneration,
        ]),
      ).toBeUndefined()
      expect(ui.html()).not.toContain(
        'href="https://example.invalid/sales?catalogDetail=item-a"',
      )
      await act(async () => {
        await delay(50)
      })
      expect(recordReads).toBe(refusedReads)
      recordError = null
      await act(async () => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await delay(20)
      })
      await act(async () => {
        await delay(20)
      })
      expect(recordReads).toBeGreaterThan(refusedReads)
      const recoveredReads = recordReads
      await act(async () => {
        await delay(40)
      })
      expect(recordReads).toBeGreaterThan(recoveredReads)
      expect(ui.html()).toContain(
        'href="https://example.invalid/sales?catalogDetail=item-a"',
      )
    } finally {
      await ui.close()
    }
  }
})

test("transient record errors retain interval recovery and minimizing aborts an in-flight private read", async () => {
  const ui = await mounted(true)
  cleanups.push(ui.close)
  await ui.render(true)
  await showRecord()
  recordError = "INTERNAL_SERVER_ERROR"
  await act(async () => {
    await ui.client.invalidateQueries({
      queryKey: ["assistant-read-record-context"],
    })
    await delay(1)
  })
  const failedReads = recordReads
  await act(async () => {
    await delay(45)
  })
  expect(recordReads).toBeGreaterThan(failedReads)
  recordError = null
  const gate = Promise.withResolvers<RecordContext>()
  recordGate = gate
  await act(async () => {
    void ui.client.invalidateQueries({
      queryKey: ["assistant-read-record-context"],
    })
    await delay(1)
  })
  await ui.render(false)
  expect(recordAborts).toBeGreaterThan(0)
  const hiddenReads = recordReads
  await act(async () => {
    gate.resolve({ tenant: { id: "tenant-a" }, activeStore: { id: "store-a" } })
    await delay(30)
  })
  expect(recordReads).toBe(hiddenReads)
  expect(ui.html()).not.toContain(
    'href="https://example.invalid/sales?catalogDetail=item-a"',
  )
})

for (const path of ["pending", "voice"]) {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"])
    test(`${path} stops ${code} intervals and resumes on focus`, async () => {
      const ui = await mounted()
      cleanups.push(ui.close)
      await ui.render(true)
      readFailures.set(path, code)
      await act(async () => {
        await ui.client.invalidateQueries({ queryKey: [path] })
        await delay(10)
      })
      expect(ui.client.getQueryData([path, undefined])).toBeUndefined()
      const refused = reads.filter((read) => read === path).length
      await act(async () => {
        await delay(45)
      })
      expect(reads.filter((read) => read === path)).toHaveLength(refused)
      readFailures.delete(path)
      await act(async () => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await delay(20)
      })
      await act(async () => {
        await delay(20)
      })
      expect(reads.filter((read) => read === path).length).toBeGreaterThan(
        refused,
      )
      const recovered = reads.filter((read) => read === path).length
      await act(async () => {
        await delay(40)
      })
      expect(reads.filter((read) => read === path).length).toBeGreaterThan(
        recovered,
      )
    })
  test(`${path} keeps transient interval recovery`, async () => {
    const ui = await mounted()
    cleanups.push(ui.close)
    await ui.render(true)
    readFailures.set(path, "INTERNAL_SERVER_ERROR")
    await act(async () => {
      await ui.client.invalidateQueries({ queryKey: [path] })
      await delay(5)
    })
    const failed = reads.filter((read) => read === path).length
    await act(async () => {
      await delay(45)
    })
    expect(reads.filter((read) => read === path).length).toBeGreaterThan(failed)
  })
}

process.on("exit", () => {
  globalThis.setInterval = realInterval
  globalThis.fetch = originalFetch
})
