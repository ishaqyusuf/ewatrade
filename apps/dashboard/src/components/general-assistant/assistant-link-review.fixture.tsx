import { expect, mock, test } from "bun:test"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

// Mount the actual focused page and actual shared proposal card. Only browser,
// RPC and design-system leaves are ports; the existing editor has its own tests.
const buttons: Record<string, { disabled?: boolean; onClick?: () => void }> = {}
let editor: { onSave: (payload: GeneralAction) => void } | null = null
const tag =
  (name: string) =>
  ({ children }: { children?: ReactNode }) =>
    createElement(name, null, children)
mock.module("@ewatrade/ui", () => ({
  Button: (props: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => {
    buttons[String(props.children)] = props
    return createElement(
      "button",
      { type: "button", disabled: props.disabled },
      props.children,
    )
  },
  Badge: tag("span"),
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? children : null,
  DialogContent: tag("section"),
  DialogHeader: tag("header"),
  DialogTitle: tag("h2"),
  DialogDescription: tag("p"),
  cn: (...names: unknown[]) => names.filter(Boolean).join(" "),
}))
mock.module("next/link", () => ({ default: tag("a") }))
mock.module("./general-product-picture", () => ({
  GeneralProductPicture: () => null,
}))
mock.module("./general-proposal-editor", () => ({
  GeneralProposalEditor: (props: {
    onSave: (payload: GeneralAction) => void
  }) => {
    editor = props
    return createElement("p", null, "Existing draft editor")
  },
}))
const payload: GeneralAction = {
  action: "product_create",
  name: "Egg",
  canonicalUnitName: "Egg",
  priceMinor: 15000,
}
const proposal = (revision: number): GeneralProposal => ({
  id: "draft",
  revision,
  payload,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  receipt: null,
  review: Array.from(
    { length: 12 },
    (_, index) => `Exact review fact ${index + 1}`,
  ),
  approvalToken: `approval-${revision}`,
})
const originalToken = `${"a".repeat(32)}.${"b".repeat(43)}`
const freshToken = `${"c".repeat(32)}.${"d".repeat(43)}`
const reads: string[] = []
const decisions: { token: string; decision: string; approvalToken?: string }[] =
  []
const edits: { token: string; payload: GeneralAction }[] = []
mock.module(new URL("../../trpc/client", import.meta.url).pathname, () => ({
  useTRPCClient: () => client,
}))
const client = {
  assistant: {
    reviewLink: {
      mutate: async ({ token }: { token: string }) => {
        reads.push(token)
        return {
          status: "ready",
          proposal: proposal(token === freshToken ? 2 : 1),
          businessName: "QA Business",
          storeName: "QA Store",
          currencyCode: "NGN",
          expiresAt: proposal(1).expiresAt,
        }
      },
    },
    editReviewLink: {
      mutate: async (input: { token: string; payload: GeneralAction }) => {
        edits.push(input)
        return { token: freshToken, proposal: proposal(2) }
      },
    },
    decideReviewLink: {
      mutate: async (input: {
        token: string
        decision: string
        approvalToken?: string
      }) => {
        decisions.push(input)
        return {
          ...proposal(2),
          status: input.decision === "confirm" ? "COMPLETED" : "CANCELLED",
        }
      },
    },
  },
}
const { AssistantLinkReview } = await import("./assistant-link-review")

async function mount(initialToken = originalToken) {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
  )
  const locations: string[] = []
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, path: string) =>
        locations.push(path),
    },
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
  await act(async () =>
    root.render(createElement(AssistantLinkReview, { initialToken })),
  )
  return {
    text: () => host.textContent,
    locations,
    press: async (name: string) =>
      act(async () => {
        const button = buttons[name]
        if (!button || button.disabled)
          throw Error(`Unavailable button: ${name}`)
        button.onClick?.()
      }),
    unmount: async () => act(async () => root.unmount()),
  }
}

test("focused review reads without saving, edits to a fresh link, and confirms or cancels through exact token-aware authority", async () => {
  const invalid = await mount("invalid-local-review")
  expect(reads).toHaveLength(0)
  expect(invalid.text()).toContain("This review is unavailable")
  await invalid.unmount()
  const view = await mount()
  expect(reads).toEqual([originalToken])
  expect(decisions).toHaveLength(0)
  expect(view.text()).toContain("Exact review fact 12")
  expect(view.text()).not.toContain("Send a message")
  await view.press("Edit")
  await act(async () => editor?.onSave({ ...payload, name: "Updated Egg" }))
  expect(edits[0]?.token).toBe(originalToken)
  expect(reads).toEqual([originalToken, freshToken])
  expect(view.locations).toEqual([`/assistant-review?token=${freshToken}`])
  await view.press("Approve and save")
  expect(decisions[0]).toEqual({
    token: freshToken,
    decision: "confirm",
    approvalToken: "approval-2",
  })
  expect(view.locations.at(-1)).toBe("/assistant-review")
  expect(view.text()).toContain("Saved")
  await view.unmount()
  const cancel = await mount()
  await cancel.press("Cancel draft")
  expect(decisions[1]).toEqual({ token: originalToken, decision: "cancel" })
  expect(cancel.text()).toContain("Draft cancelled")
  await cancel.unmount()
})
