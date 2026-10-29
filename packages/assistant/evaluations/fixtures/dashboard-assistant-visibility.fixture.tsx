import { afterEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import {
  type ComponentProps,
  type ReactNode,
  act,
  useCallback,
  useEffect,
  useState,
} from "react"

// Real GeneralChat, its hook, composer and QueryClient/observers. Only RPC, SDK
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
const { QueryClient, QueryClientProvider, focusManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
focusManager.setFocused(true)
const realInterval = globalThis.setInterval
// Accelerate only the production 60s optional polls, preserving real observer work.
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) =>
  realInterval(
    callback,
    delay === 60_000 ? 15 : delay,
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
mock.module("next/link", () => ({ default: leaf }))
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
  ["general-answer-card", { GeneralAnswerCard: () => null }],
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
globalThis.fetch = async (input) => {
  const path = String(input)
  if (!path.startsWith("/api/assistant/general/runs/"))
    throw Error("Unexpected network boundary")
  runReads.push(path)
  return Response.json({ conversationId: "chat-a", status: runStatus })
}
const reads: string[] = []
function endpoint(path: string, get: () => unknown) {
  return {
    queryKey: () => [path],
    pathKey: () => [path],
    queryOptions: (input?: unknown, options?: object) => ({
      queryKey: [path, input],
      queryFn: async () => {
        reads.push(path)
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
mock.module(app("trpc/client"), () => ({ useTRPC: () => trpc }))
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
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function mounted() {
  reads.length = 0
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  const render = async (active: boolean) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <GeneralChat active={active} />
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

process.on("exit", () => {
  globalThis.setInterval = realInterval
  globalThis.fetch = originalFetch
})
