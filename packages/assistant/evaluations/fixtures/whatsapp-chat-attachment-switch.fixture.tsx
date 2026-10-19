import { expect, mock, test } from "bun:test"
import { type ReactNode, act, useCallback, useState } from "react"

// Actual dashboard/native chat hooks and the mounted native receipt composer.
// Boundary doubles replace auth, tRPC, SDK transport, pickers and native views;
// no server, filesystem, provider or device operation runs. Run in isolation.
const root = new URL("../../../../", import.meta.url)
const path = (app: string, name: string) =>
  new URL(`apps/${app}/src/${name}`, root).pathname
const mobile = (name: string, value: Record<string, unknown>) =>
  mock.module(path("mobile", name), () => value)
const dashboard = (name: string, value: Record<string, unknown>) =>
  mock.module(path("dashboard", name), () => value)
const session = {
  token: "synthetic-session",
  profile: {
    id: "actor",
    businessId: "tenant",
    businessSlug: "tenant",
    storeId: "store",
    role: "OWNER",
    status: "ACTIVE",
  },
}
let activeSession = session
let cacheGeneration = 1
const empty: never[] = []
let statusRows: unknown[] = empty
const intents: { input: unknown; resolve: (value: unknown) => void }[] = []
const sends: unknown[] = []
let uploads = 0
let starts = 0
let stateError = false
let availabilityEnabled = true
let chatStatus = "ready"
let savedChats: unknown[] = empty
const query = (kind: string) => ({
  queryOptions: (_input?: unknown, _options?: unknown) => ({ kind }),
})
const mutation = (kind: string) => ({ mutationOptions: () => ({ kind }) })
const trpc = {
  assistant: {
    availability: query("availability"),
    conversations: query("conversations"),
    conversation: query("conversation"),
    pendingProposals: query("pending"),
    start: mutation("start"),
    decideProposal: mutation("decide"),
    editProposal: mutation("edit"),
    pathKey: () => ["assistant"],
  },
  setupAssistant: {
    attachments: {
      voiceCapabilities: query("voice"),
      list: query("attachments"),
      createIntent: mutation("intent"),
      remove: mutation("remove"),
    },
  },
}
const refetch = async () => ({ data: undefined })
mock.module("@tanstack/react-query", () => ({
  useQuery: ({ kind }: { kind: string }) => ({
    data:
      kind === "availability"
        ? { enabled: availabilityEnabled, media: { files: true, photos: true } }
        : kind === "voice"
          ? { enabled: true }
          : kind === "conversations"
            ? savedChats
            : kind === "pending"
              ? empty
              : kind === "attachments"
                ? statusRows
                : undefined,
    isError: kind === "conversation" && stateError,
    isSuccess: true,
    isFetching: false,
    isPending: false,
    isFetchedAfterMount: true,
    dataUpdatedAt: 1,
    refetch,
  }),
  useMutation: ({ kind }: { kind: string }) => ({
    mutateAsync: (input: unknown) =>
      kind === "intent"
        ? new Promise((resolve) => intents.push({ input, resolve }))
        : Promise.resolve(
            kind === "start" ? { id: `created-${++starts}` } : {},
          ),
  }),
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}))
for (const app of ["dashboard", "mobile"])
  mock.module(path(app, "trpc/client"), () => ({
    useTRPC: () => trpc,
    getDataCacheGeneration: () => cacheGeneration,
  }))
mock.module("@ai-sdk/react", () => ({
  useChat: () => {
    const [messages, setMessages] = useState<unknown[]>([])
    const stop = useCallback(async () => {}, [])
    return {
      messages,
      setMessages,
      stop,
      status: chatStatus,
      error: undefined,
      sendMessage: async (input: unknown) => {
        sends.push(input)
      },
    }
  },
}))
mock.module("ai", () => ({ DefaultChatTransport: class {} }))
dashboard("components/page-fab/fab-slot", {
  useAssistantDraftRequests: () => {},
})
const workflow = { track: () => {} }
mock.module("@ewatrade/events/dashboard-client", () => ({
  useDashboardWorkflow: () => workflow,
}))
mobile("lib/session-store", { getSession: () => activeSession })
mobile("lib/base-url", { getBaseUrl: () => "https://synthetic.invalid" })
mobile("hooks/use-auth", {
  useAuthContext: () => ({
    session: activeSession,
    token: activeSession.token,
    profile: activeSession.profile,
  }),
})
const operational = Object.assign(
  (read: (state: { isOfflineMode: boolean }) => unknown) =>
    read({ isOfflineMode: false }),
  { getState: () => ({ isOfflineMode: false }) },
)
mobile("store/operationalModeStore", { useOperationalModeStore: operational })
mock.module("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {} },
}))
mock.module("expo-router", () => ({ useLocalSearchParams: () => ({}) }))
mock.module("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }) },
}))
mock.module("expo/fetch", () => ({
  fetch: async () => {
    uploads += 1
    return new Response(null, { status: 200 })
  },
}))
mock.module("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }))
mock.module("expo-document-picker", () => ({
  getDocumentAsync: async () => ({
    canceled: false,
    assets: [
      {
        name: "old.pdf",
        uri: "synthetic",
        mimeType: "application/pdf",
        size: 1,
      },
    ],
  }),
}))
mock.module("expo-image-picker", () => ({}))
mock.module("expo-file-system", () => ({ File: class {} }))
mobile("lib/order-attachment-upload", {
  ORDER_ATTACHMENT_MAX_BYTES: 100,
  ORDER_ATTACHMENT_TYPES: ["application/pdf"],
  readOrderAttachmentFile: async () => ({
    contentDigest: "synthetic",
    sizeBytes: 1,
    buffer: new ArrayBuffer(1),
  }),
})
const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
for (const name of ["view", "text"])
  mobile(`components/ui/${name}`, { [name === "view" ? "View" : "Text"]: pass })
mobile("components/ui/icon", { Icon: () => null })
mobile("hooks/use-color", { useColors: () => ({}) })
const buttons = new Map<string, () => void>()
mobile("components/ui/pressable", {
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode
    onPress?: () => void
    accessibilityLabel?: string
  }) => {
    const label =
      accessibilityLabel ?? (typeof children === "string" ? children : "")
    if (onPress) buttons.set(label, onPress)
    return <div>{children}</div>
  },
})
type ComposerBoundary = {
  children?: ReactNode
  value: string
  onAttach?: () => void
  voice?: { stopAndSend: () => void }
}
let composer: ComposerBoundary = { value: "" }
mobile("components/mobile/assistant/assistant-ui", {
  AssistantComposer: (props: ComposerBoundary) => {
    composer = props
    return (
      <div>
        <output>{props.value}</output>
        {props.children}
      </div>
    )
  },
})
let recorded: ((file: { uri: string; size: number }) => boolean) | undefined
mobile("components/mobile/customer-conversations/use-customer-voice-note", {
  useCustomerVoiceNote: (input: { onReady: typeof recorded }) => {
    recorded = input.onReady
    return {
      state: { kind: "idle" },
      start() {},
      stop() {},
      cancel() {},
      dismiss() {},
    }
  },
})
const { useGeneralAssistant: useDashboard } = await import(
  "../../../../apps/dashboard/src/components/general-assistant/use-general-assistant"
)
const { useGeneralAssistant: useMobile } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/use-general-assistant"
)
const { AssistantChatBox } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/assistant-chat-box"
)
// Keep the real Workbench, flag calculation, saved list and routing effects.
// Capture its real hook result; only heavy presentation leaves are stood in.
let workbench: ReturnType<typeof useDashboard>
mock.module(
  path("dashboard", "components/general-assistant/use-general-assistant"),
  () => ({
    useGeneralAssistant: (options: Parameters<typeof useDashboard>[0]) => {
      workbench = useDashboard(options)
      return workbench
    },
  }),
)
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  Button: (props: Record<string, unknown>) => <button {...props} />,
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
mock.module("streamdown", () => ({ Streamdown: leaf }))
mock.module("use-stick-to-bottom", () => ({
  StickToBottom: Object.assign(leaf, { Content: leaf }),
}))
mock.module("next/link", () => ({ default: leaf }))
let routeId: string | null = "missing-chat"
const navigations: string[] = []
const router = {
  push: (href: string) => {
    navigations.push(href)
    routeId =
      href === "/assistant"
        ? null
        : decodeURIComponent(href.split("/").at(-1) ?? "")
  },
  replace: (href: string) => {
    navigations.push(href)
  },
}
mock.module("next/navigation", () => ({
  useParams: () => ({ id: routeId }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => router,
}))
dashboard("hooks/use-assistant-draft-job-handoff", {
  AssistantDraftJobHandoffProvider: leaf,
  useAssistantDraftJobHandoff: () => ({}),
})
dashboard("hooks/use-assistant-receipt", {
  useAssistantReceipt: () => () => {},
})
dashboard("hooks/use-quick-chat-param", {
  useQuickChatParam: () => [null, () => {}],
})
let dashboardComposer: { disabled?: boolean; blocked?: boolean } = {}
const composerLeaf = (props: {
  disabled?: boolean
  blocked?: boolean
  value?: string
}) => {
  dashboardComposer = props
  return <output>{props.value}</output>
}
dashboard("components/general-assistant/assistant-composer", {
  AssistantComposer: composerLeaf,
})
dashboard("components/general-assistant/general-attachment-tray", {
  GeneralAttachComposer: composerLeaf,
})
dashboard("components/general-assistant/assistant-links", {
  AssistantLinks: () => null,
})
dashboard("components/general-assistant/general-answer-card", {
  GeneralAnswerCard: () => null,
})
dashboard("components/general-assistant/general-chat-photo", {
  GeneralSentFile: () => null,
})
dashboard("components/general-assistant/general-proposal-card", {
  GeneralOutcomeList: () => null,
  GeneralProposalCard: () => null,
  isGeneralOutcome: () => false,
})
dashboard("components/general-assistant/general-proposal-editor", {
  GeneralProposalEditor: () => null,
})
dashboard("components/general-assistant/general-unavailable-proposals", {
  GeneralUnavailableProposals: () => null,
})
const { AssistantWorkbench } = await import(
  "../../../../apps/dashboard/src/components/general-assistant/assistant-workbench"
)

async function mount() {
  const { DOMImplementation } = await import("@xmldom/xmldom")
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
  }
  Object.assign(globalThis, {
    window,
    document,
    IS_REACT_ACT_ENVIRONMENT: true,
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
      addEventListener() {},
      removeEventListener() {},
    })
  const text = document.createTextNode.bind(document)
  document.createTextNode = (value: string) => {
    const node = text(value)
    Object.defineProperty(node, "nodeValue", {
      get: () => node.data,
      set: (value: string) => {
        node.data = value
      },
    })
    return node
  }
  const { createRoot } = await import("react-dom/client")
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  return {
    render: (node: ReactNode) => act(async () => root.render(node)),
    html: () => host.toString(),
    unmount: () => act(async () => root.unmount()),
    button: (label: string) => {
      const button = Array.from(host.getElementsByTagName("button")).find(
        (node) => node.textContent?.trim().startsWith(label),
      )
      if (!button) throw Error(`Actual rendered button missing: ${label}`)
      return {
        disabled: button.hasAttribute("disabled"),
        invoke: async () => {
          const props = Object.entries(button).find(([key]) =>
            key.startsWith("__reactProps$"),
          )?.[1]
          if (typeof props?.onClick !== "function")
            throw Error("Actual rendered handler missing")
          await act(async () => {
            await props.onClick()
            await settle()
          })
        },
      }
    },
  }
}
let web: ReturnType<typeof useDashboard>
let native: ReturnType<typeof useMobile>
function Dashboard() {
  web = useDashboard({ initialConversationId: "old-web", blankStart: true })
  return <output>{web.conversationId}</output>
}
function Native() {
  native = useMobile()
  return (
    <AssistantChatBox
      conversationId={native.composerConversationId}
      resetKey={native.trayKey}
      onReadyChange={native.setReadyFiles}
      value={native.draft}
      onChange={native.setDraft}
      onSend={() => void native.send()}
      onStop={() => {}}
      busy={native.busy}
      disabled={false}
    />
  )
}
const settle = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}
function resolveIntent(index: number, attachmentId: string) {
  const call = intents[index]
  if (!call) throw Error("Expected real mounted receipt intent")
  call.resolve({
    ok: true,
    attachment: { id: attachmentId },
    uploadPath: "/synthetic",
  })
}

test("mounted New/choose clears old originals and stale native uploads/voice cannot follow the selected chat", async () => {
  const webRoot = await mount()
  const nativeRoot = await mount()
  try {
    await webRoot.render(<Dashboard />)
    await act(async () =>
      web.setReadyAttachments([
        { attachmentId: "old-web-file", fileName: "old.pdf" },
      ]),
    )
    await act(async () => web.clearThread())
    expect(web.conversationId).toBeNull()
    expect(web.readyAttachments).toEqual([])
    await act(async () => web.choose("chosen-web"))
    await act(async () =>
      web.setReadyAttachments([
        { attachmentId: "chosen-web-file", fileName: "old.pdf" },
      ]),
    )
    await act(async () => web.choose("other-web"))
    expect(web.readyAttachments).toEqual([])
    await act(async () =>
      web.setReadyAttachments([
        { attachmentId: "other-file", fileName: "old.pdf" },
      ]),
    )
    await act(async () => {
      await web.newThread()
    })
    expect(web.conversationId).toBe("created-1")
    expect(web.readyAttachments).toEqual([])

    await nativeRoot.render(<Native />)
    await act(async () => native.choose("old-native"))
    // Actual mounted picker/status/ready callback, then choose must clear both
    // the visible chip and the hook's sendable original IDs.
    await act(async () => {
      composer.onAttach?.()
    })
    const pdf = buttons.get("PDF")
    if (!pdf) throw Error("Expected actual mounted PDF action")
    await act(async () => {
      pdf()
      await settle()
    })
    expect(intents).toHaveLength(1)
    await act(async () => {
      resolveIntent(0, "ready-old-pdf")
      await settle()
    })
    statusRows = [{ id: "ready-old-pdf", status: "READY" }]
    await nativeRoot.render(<Native />)
    expect(native.readyFiles).toEqual([
      { attachmentId: "ready-old-pdf", fileName: "old.pdf" },
    ])
    expect(nativeRoot.html()).toContain("old.pdf")
    await act(async () => native.choose("second-native"))
    expect(native.readyFiles).toEqual([])
    expect(nativeRoot.html()).not.toContain("old.pdf")
    statusRows = empty
    // Start a real file-picker→intent chain, then switch before intent resolves.
    await act(async () => {
      composer.onAttach?.()
    })
    // Menu labels are rendered through the native Text primitive.
    const oldPick = intents.length
    // Recorder completion enters the same real upload pipeline without UI picker ambiguity.
    const oldRecording = recorded
    await act(async () => {
      recorded?.({ uri: "voice", size: 1 })
      await settle()
    })
    expect(intents.length).toBe(oldPick + 1)
    await act(async () => native.choose("chosen-native"))
    await act(async () => {
      resolveIntent(oldPick, "old-audio")
      await settle()
    })
    expect(uploads).toBe(1)
    expect(native.readyFiles).toEqual([])
    expect(nativeRoot.html()).not.toContain("voice-note")
    await act(async () => {
      oldRecording?.({ uri: "stale-voice", size: 1 })
      await settle()
    })
    expect(intents.length).toBe(oldPick + 1)

    // A current voice upload finishes, but its late transcript cannot enter New chat.
    const voiceIndex = intents.length
    await act(async () => {
      recorded?.({ uri: "current-voice", size: 1 })
      await settle()
    })
    await act(async () => {
      resolveIntent(voiceIndex, "current-audio")
      await settle()
    })
    expect(uploads).toBe(2)
    await act(async () => native.fresh())
    statusRows = [
      {
        id: "current-audio",
        status: "READY",
        transcript: "OLD_PRIVATE_SPEECH",
      },
    ]
    await nativeRoot.render(<Native />)
    expect(native.draft).toBe("")
    expect(native.readyFiles).toEqual([])
    expect(nativeRoot.html()).not.toContain("OLD_PRIVATE_SPEECH")
    expect(sends).toEqual([])

    // A missing target must block sending, while its actual New/history
    // controls still permit recovery without retaining the old composer.
    stateError = true
    savedChats = [
      { id: "saved-recovery", title: "Saved recovery", updatedAt: new Date() },
    ]
    const navigationRoot = await mount()
    try {
      await navigationRoot.render(<AssistantWorkbench />)
      expect(dashboardComposer.disabled).toBe(true)
      expect(navigationRoot.button("New chat").disabled).toBe(false)
      expect(navigationRoot.button("Saved recovery").disabled).toBe(false)
      await act(async () => {
        await workbench.send("blocked target message")
      })
      expect(sends).toEqual([])
      await navigationRoot.button("Saved recovery").invoke()
      await navigationRoot.render(<AssistantWorkbench />)
      expect(workbench.conversationId).toBe("saved-recovery")
      await act(async () => {
        workbench.setDraft("UNSENT_OLD_DRAFT")
        workbench.setReadyAttachments([
          { attachmentId: "old-original", fileName: "old.pdf" },
        ])
      })
      await navigationRoot.button("New chat").invoke()
      await navigationRoot.render(<AssistantWorkbench />)
      expect(routeId).toBeNull()
      expect(workbench.conversationId).toBeNull()
      expect(workbench.draft).toBe("")
      expect(workbench.readyAttachments).toEqual([])
      chatStatus = "streaming"
      await navigationRoot.render(<AssistantWorkbench />)
      expect(navigationRoot.button("New chat").disabled).toBe(true)
      const beforeBusyNavigation = navigations.length
      await navigationRoot.button("New chat").invoke()
      expect(navigations.length).toBe(beforeBusyNavigation)
      chatStatus = "ready"
      availabilityEnabled = false
      await navigationRoot.render(<AssistantWorkbench />)
      expect(navigationRoot.button("New chat").disabled).toBe(true)
      availabilityEnabled = true
      await navigationRoot.render(<AssistantWorkbench />)
      await act(async () => {
        await workbench.newThread()
      })
      expect(workbench.conversationId).toBe("created-2")
      expect(workbench.readyAttachments).toEqual([])
    } finally {
      await navigationRoot.unmount()
    }

    // Actual auth/cache replacement must fence the still-mounted old chat,
    // including an already-dispatched recording's late READY result.
    await act(async () => native.choose("scope-private-chat"))
    const scopeVoice = intents.length
    await act(async () => {
      recorded?.({ uri: "scope-voice", size: 1 })
      await settle()
    })
    await act(async () => {
      resolveIntent(scopeVoice, "scope-audio")
      await settle()
    })
    const retainedBeforeScopeChange = recorded
    const uploadsBeforeScopeChange = uploads
    const intentsBeforeScopeChange = intents.length
    activeSession = {
      ...session,
      token: "different-session",
      profile: { ...session.profile, id: "different-actor" },
    }
    cacheGeneration++
    await nativeRoot.render(<Native />)
    expect(native.scopeChanged).toBe(true)
    statusRows = [
      {
        id: "scope-audio",
        status: "READY",
        transcript: "SCOPE_PRIVATE_SPEECH",
      },
    ]
    await nativeRoot.render(<Native />)
    expect(native.draft).toBe("")
    expect(native.readyFiles).toEqual([])
    expect(nativeRoot.html()).not.toContain("SCOPE_PRIVATE_SPEECH")
    await act(async () => {
      retainedBeforeScopeChange?.({ uri: "stale-scope", size: 1 })
      await settle()
    })
    expect(intents.length).toBe(intentsBeforeScopeChange)
    expect(uploads).toBe(uploadsBeforeScopeChange)
    expect(sends).toEqual([])
  } finally {
    await nativeRoot.unmount()
    await webRoot.unmount()
  }
})
