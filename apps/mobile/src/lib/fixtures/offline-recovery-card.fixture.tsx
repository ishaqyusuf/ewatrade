import { expect, mock, test } from "bun:test"
import { formatMinorMoney } from "@ewatrade/utils"
import { type ComponentProps, type ReactNode, act, createElement } from "react"
import type { OfflineConflictRow } from "../../components/mobile/offline-recovery-review-model"
import type { RecoveryDecisionOutcome } from "../../hooks/use-offline-replay"

type Button = {
  children?: ReactNode
  disabled?: boolean
  onPress: () => unknown
}
const buttons = new Map<string, Button>()
let field: { onChangeText: (value: string) => void } | null = null
const box = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
for (const [path, name] of [
  ["ui/text", "Text"],
  ["ui/view", "View"],
]) {
  mock.module(
    new URL(`../../components/${path}`, import.meta.url).pathname,
    () => ({ [name]: box }),
  )
}
mock.module(
  new URL("../../components/mobile/action-button", import.meta.url).pathname,
  () => ({
    ActionButton: (props: Button) => {
      buttons.set(String(props.children), props)
      return box(props)
    },
  }),
)
mock.module(
  new URL("../../components/mobile/form-field", import.meta.url).pathname,
  () => ({
    FormField: (props: { onChangeText: (value: string) => void }) => {
      field = props
      return null
    },
  }),
)
mock.module(
  new URL("../../components/mobile/status-banner", import.meta.url).pathname,
  () => ({
    StatusBanner: ({ message, title }: { message?: string; title?: string }) =>
      createElement("div", null, title, message),
  }),
)
mock.module(
  new URL("../../components/mobile/green-till/kit", import.meta.url).pathname,
  () => ({
    StatusPill: ({ label }: { label: string }) =>
      createElement("div", null, label),
  }),
)
const { OfflineRecoveryReviewCard } = await import(
  "../../components/mobile/offline-recovery-review"
)
type Props = ComponentProps<typeof OfflineRecoveryReviewCard>

function originalRow(): OfflineConflictRow {
  return {
    id: "held-command",
    actor: {
      id: "original-rep",
      name: "Original rep",
      displayName: "Original rep",
      email: "rep@example.test",
    },
    recovery: {
      version: 1,
      kind: "suspended_staff",
      membershipId: "membership",
      accessRevision: 2,
      lifecycleEventId: "event",
      accessChangedAt: "2026-10-17T10:00:00.000Z",
      receivedAt: "2026-10-17T11:00:00.000Z",
    },
    recoveryOrigin: {
      store: {
        id: "original-store",
        name: "Original Store",
        currencyCode: "NGN",
        status: "ACTIVE",
      },
      device: null,
      moneyAccount: { id: "original-cash", name: "Original till" },
    },
    recoveryEnvelope: {
      clientCommandId: "held-sale",
      createdAtClient: new Date("2026-10-17T09:00:00.000Z"),
      dependencyClientIds: [],
      eventVersion: 1,
      payload: {
        kind: "commercial_order",
        fulfillNow: true,
        customerName: "Customer",
        lines: [
          { custom: "quick_sale", description: "Rice", amountMinor: 500 },
          {
            custom: "additional_cost",
            description: "Delivery",
            amountMinor: 100,
          },
          {
            offeringId: "catalog-reference-123456",
            quantity: "2",
            expectedFixedPriceMinor: 300,
          },
        ],
        initialPayment: {
          amountMinor: 500,
          clientPaymentId: "original-payment",
          method: "cash",
          moneyAccountId: "original-cash",
        },
      },
    },
    reviewKind: "suspended_recovery",
  } as unknown as OfflineConflictRow
}

async function mount(patch: Partial<Props> = {}) {
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
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  const calls: Parameters<Props["onDecide"]>[0][] = []
  let response: RecoveryDecisionOutcome = "applied"
  let props: Props = {
    conflict: originalRow(),
    viewerRole: "OWNER",
    viewerId: "reviewer",
    disabled: false,
    onDecide: async (input) => {
      calls.push(input)
      return response
    },
    ...patch,
  }
  const clear = () => {
    buttons.clear()
    field = null
  }
  const ui = {
    calls,
    get text() {
      return host.textContent ?? ""
    },
    get props() {
      return props
    },
    button(label: string) {
      const found = buttons.get(label)
      if (!found) throw Error(`Button missing: ${label}`)
      return found
    },
    hasButton(label: string) {
      return buttons.has(label)
    },
    setResponse(value: RecoveryDecisionOutcome) {
      response = value
    },
    async render(change: Partial<Props> = {}) {
      props = { ...props, ...change }
      clear()
      await act(async () =>
        root.render(createElement(OfflineRecoveryReviewCard, props)),
      )
    },
    async run(operation: () => unknown) {
      clear()
      await act(async () => {
        await operation()
      })
    },
    async reason(value = "Verified original sale") {
      const port = field
      if (!port) throw Error("Reason input missing")
      await ui.run(() => port.onChangeText(value))
    },
    async close() {
      await act(async () => root.unmount())
    },
  }
  await ui.render()
  return ui
}

test("actual card shows each original line, quantity, payment account and exact decision envelope", async () => {
  const ui = await mount()
  try {
    for (const value of [
      "Rice",
      "Delivery",
      "2 ×",
      "…123456",
      "Original till",
      "Customer",
    ])
      expect(ui.text).toContain(value)
    for (const amount of [500, 100, 300])
      expect(ui.text).toContain(formatMinorMoney(amount, "NGN"))
    await ui.reason("  Checked original receipt  ")
    const press = ui.button("Approve this sale").onPress
    await ui.run(press)
    const envelope = ui.props.conflict.recoveryEnvelope
    if (!envelope) throw Error("Missing exact held envelope")
    expect(ui.calls).toEqual([
      {
        commandId: "held-command",
        decision: "approve",
        reason: "Checked original receipt",
        envelope,
      },
    ])
  } finally {
    await ui.close()
  }
})

test("actual card displays an entered catalog total present in the held envelope", async () => {
  const row = originalRow()
  if (!row.recoveryEnvelope) throw Error("Missing envelope")
  Object.assign(row.recoveryEnvelope.payload, {
    lines: [
      {
        offeringId: "catalog-order-total",
        quantity: "3",
        enteredTotalMinor: 1200,
        expectedFixedPriceMinor: 500,
      },
    ],
  })
  const ui = await mount({ conflict: row })
  try {
    expect(ui.text).toContain(formatMinorMoney(1200, "NGN"))
    expect(ui.text).toContain("Catalog item · entered total")
    expect(ui.text).not.toContain("Catalog item · unit price")
  } finally {
    await ui.close()
  }
})

test("held decision retains reason/actions and can be explicitly retried", async () => {
  const ui = await mount()
  try {
    ui.setResponse("held")
    await ui.reason()
    await ui.run(ui.button("Approve this sale").onPress)
    expect(ui.text).toContain("Still held")
    expect(ui.button("Approve this sale").disabled).toBe(false)
    expect(ui.hasButton("Reject")).toBe(true)
    ui.setResponse("applied")
    await ui.run(ui.button("Approve this sale").onPress)
    expect(ui.calls).toHaveLength(2)
    expect(ui.text).toContain("Approved. The sale is recorded.")
  } finally {
    await ui.close()
  }
})

for (const outcome of [
  "applied_refresh_failed",
  "rejected_refresh_failed",
] as const) {
  test(`actual card keeps ${outcome} coherent while its conflict row remains stale`, async () => {
    const ui = await mount()
    try {
      ui.setResponse(outcome)
      await ui.reason()
      await ui.run(ui.button("Approve this sale").onPress)
      await ui.render({ conflict: { ...ui.props.conflict } })
      expect(ui.text).toContain(
        outcome.startsWith("applied")
          ? "Approved. The sale is recorded."
          : "Rejected. Nothing was recorded.",
      )
      expect(ui.text).toContain("Some lists didn't refresh")
      expect(ui.text).not.toContain("Held for owner review")
      expect(ui.text).not.toContain("Nothing has changed in your records yet")
      expect(ui.hasButton("Approve this sale")).toBe(false)
      expect(ui.hasButton("Reject")).toBe(false)
    } finally {
      await ui.close()
    }
  })
}

for (const [label, change] of [
  ["Manager", { viewerRole: "MANAGER" }],
  ["self", { viewerId: "original-rep" }],
] as const) {
  test(`retained actual-card action cannot dispatch after ${label} access is shown`, async () => {
    const ui = await mount()
    try {
      await ui.reason()
      const retained = ui.button("Approve this sale").onPress
      await ui.render(change)
      expect(ui.hasButton("Approve this sale")).toBe(false)
      await ui.run(retained)
      expect(ui.calls).toHaveLength(0)
    } finally {
      await ui.close()
    }
  })
}

test("retained actual-card action cannot send again after a terminal decision", async () => {
  const ui = await mount()
  try {
    await ui.reason()
    const retained = ui.button("Approve this sale").onPress
    await ui.run(retained)
    expect(ui.calls).toHaveLength(1)
    await ui.run(retained)
    expect(ui.calls).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("missing original Store permits rejection but hides approval", async () => {
  const row = originalRow()
  row.recoveryOrigin = { store: null, device: null, moneyAccount: null }
  const ui = await mount({ conflict: row })
  try {
    expect(ui.hasButton("Approve this sale")).toBe(false)
    expect(ui.hasButton("Reject")).toBe(true)
    await ui.reason()
    await ui.run(ui.button("Reject").onPress)
    expect(ui.calls[0]?.decision).toBe("reject")
  } finally {
    await ui.close()
  }
})

test("missing immutable envelope exposes assisted recovery without decision actions", async () => {
  const row = originalRow()
  row.recoveryEnvelope = null
  const ui = await mount({ conflict: row })
  try {
    expect(ui.text).toContain("Needs assisted recovery")
    expect(ui.hasButton("Approve this sale")).toBe(false)
    expect(ui.hasButton("Reject")).toBe(false)
  } finally {
    await ui.close()
  }
})

test("an unmounted card's retained action is inert", async () => {
  const ui = await mount()
  await ui.reason()
  const retained = ui.button("Approve this sale").onPress
  await ui.close()
  await retained()
  expect(ui.calls).toHaveLength(0)
})

test("retained approval checks the current original Store availability", async () => {
  const ui = await mount()
  try {
    await ui.reason()
    const retained = ui.button("Approve this sale").onPress
    const row = originalRow()
    row.recoveryOrigin = { store: null, device: null, moneyAccount: null }
    await ui.render({ conflict: row })
    expect(ui.hasButton("Approve this sale")).toBe(false)
    expect(ui.hasButton("Reject")).toBe(true)
    await ui.run(retained)
    expect(ui.calls).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("two retained taps before a render send only one card decision", async () => {
  let calls = 0
  let resolve!: (outcome: RecoveryDecisionOutcome) => void
  const pending = new Promise<RecoveryDecisionOutcome>((done) => {
    resolve = done
  })
  const ui = await mount({
    onDecide: async () => {
      calls++
      return pending
    },
  })
  try {
    await ui.reason()
    const retained = ui.button("Approve this sale").onPress
    await ui.run(() => {
      retained()
      retained()
    })
    expect(calls).toBe(1)
    expect(ui.button("Approve this sale").disabled).toBe(true)
  } finally {
    await ui.run(() => resolve("held"))
    await ui.close()
  }
})
