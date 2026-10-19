import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

// Mount the actual Order component. Native views, entitlement and media are
// inert ports: these tests cannot open a picker, read a file or call a server.
const src = new URL("../../../", import.meta.url)
const standIn = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, src).pathname, () => exports)
const box = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
let controls = new Map<string, () => unknown>()
let dismissSheet: () => unknown = () => {}
let presents = 0
let dismisses = 0
let restricted = 0
let generation = 0
let status = "allowed"
let offline = false
const picks: string[] = []
const modal = {
  ref: null,
  present: () => presents++,
  dismiss: () => dismisses++,
}
standIn("components/ui/view", { View: box })
standIn("components/ui/text", { Text: box })
standIn("components/ui/icon", { Icon: () => null })
standIn("components/ui/pressable", {
  Pressable: (props: {
    accessibilityLabel?: string
    onPress: () => unknown
    children?: ReactNode
  }) => {
    if (props.accessibilityLabel)
      controls.set(props.accessibilityLabel, props.onPress)
    return box(props)
  },
})
standIn("components/ui/modal", {
  Modal: (props: { onDismiss: () => unknown; children?: ReactNode }) => {
    dismissSheet = props.onDismiss
    return box(props)
  },
  useModal: () => modal,
})
standIn("components/mobile/attachment-lock-sheet", {
  AttachmentLockSheet: () => null,
})
standIn("components/mobile/commerce/commerce-model", {
  formatCommerceDateTime: () => "",
})
standIn("components/mobile/status-banner", { StatusBanner: () => null })
standIn("hooks/use-color", { useColors: () => ({}) })
standIn("lib/order-attachment-upload", { orderAttachmentSource: () => null })
standIn("lib/utils", {
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
})
standIn("runtime/analytics-runtime", { trackMobileActivity() {} })
standIn("hooks/use-attachment-entitlement", {
  useAttachmentEntitlement: () => {
    const origin = generation
    return {
      entitlement: { status },
      sheet: null,
      closeSheet() {},
      promptAction() {},
      seePlans() {},
      async attempt(open: () => unknown) {
        if (origin !== generation || offline) return
        if (status === "locked") {
          restricted++
          return
        }
        if (status === "allowed") await open()
      },
    }
  },
})
standIn("components/mobile/order-detail/use-order-activity", {
  useOrderActivity: () => ({
    canAddFiles: true,
    entries: [],
    files: [],
    body: "",
    isPosting: false,
    setBody() {},
    pickVideo: async (source: string) => {
      picks.push(source)
    },
  }),
})
mock.module("@gorhom/bottom-sheet", () => ({ BottomSheetView: box }))
mock.module("expo-image", () => ({ Image: box }))
mock.module("expo-video", () => ({
  VideoView: box,
  useVideoPlayer: () => null,
}))
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0 }),
}))
mock.module("react-native", () => ({
  Modal: () => null,
  Text: box,
  View: box,
  TextInput: () => null,
}))
const { OrderNotesAndPhotos } = await import("./order-notes-photos")
beforeEach(() => {
  controls = new Map()
  presents = 0
  dismisses = 0
  restricted = 0
  generation++
  status = "allowed"
  offline = false
  picks.length = 0
})
async function mount() {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    document,
    window,
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
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  let orderId = "order-a"
  const render = async () =>
    act(async () =>
      root.render(
        createElement(OrderNotesAndPhotos, { orderId, isOffline: offline }),
      ),
    )
  await render()
  return {
    render,
    async order(id: string) {
      orderId = id
      await render()
    },
    async press(label: string) {
      const action = controls.get(label)
      if (!action) throw Error(`Missing control ${label}`)
      await act(async () => {
        await action()
      })
    },
    async finish() {
      await act(async () => {
        await dismissSheet()
      })
    },
    async close() {
      await act(async () => root.unmount())
    },
  }
}
test("video choice waits for native dismissal, runs once and keeps exact camera/library source", async () => {
  const ui = await mount()
  try {
    await ui.press("Add video")
    expect(presents).toBe(1)
    await ui.press("Choose video")
    await ui.press("Record video")
    expect(picks).toEqual([])
    expect(dismisses).toBe(1)
    await ui.finish()
    expect(picks).toEqual(["library"])
    await ui.finish()
    expect(picks).toEqual(["library"])
    await ui.press("Add video")
    await ui.press("Record video")
    await ui.finish()
    expect(picks).toEqual(["library", "camera"])
  } finally {
    await ui.close()
  }
})
test("cancel, offline retirement, Order change and unmount never release a picker", async () => {
  const ui = await mount()
  await ui.press("Add video")
  await ui.finish()
  expect(picks).toEqual([])
  await ui.press("Add video")
  await ui.press("Record video")
  offline = true
  await ui.render()
  await ui.finish()
  expect(picks).toEqual([])
  offline = false
  await ui.render()
  await ui.press("Add video")
  await ui.press("Choose video")
  await ui.order("order-b")
  await ui.finish()
  expect(picks).toEqual([])
  await ui.press("Add video")
  await ui.press("Record video")
  await ui.close()
  await ui.finish()
  expect(picks).toEqual([])
})
test("choice uses the opening render's lifetime gate after a same-scope session round trip", async () => {
  const ui = await mount()
  try {
    await ui.press("Add video")
    generation += 2
    await ui.render()
    await ui.press("Choose video")
    await ui.finish()
    expect(picks).toEqual([])
  } finally {
    await ui.close()
  }
})
test("Free outer lock bypasses chooser and a later downgrade retires an open chooser", async () => {
  status = "locked"
  const ui = await mount()
  try {
    await ui.press("Add video, locked on the Free plan")
    expect(restricted).toBe(1)
    expect(presents).toBe(0)
    status = "allowed"
    await ui.render()
    await ui.press("Add video")
    await ui.press("Choose video")
    status = "locked"
    await ui.render()
    await ui.finish()
    expect(picks).toEqual([])
  } finally {
    await ui.close()
  }
})
