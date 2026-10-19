import { expect, mock, test } from "bun:test"
import { act, createElement } from "react"
import type { StockBalance } from "../../components/mobile/stock-intake/stock-intake-model"
import { useStockActivity } from "../../components/mobile/stock-intake/use-stock-activity"
import {
  type ParsedStockIntakeTarget,
  parseStockIntakeTarget,
} from "../stock-intake-target"

// Real React effects and the actual hook, with no native runtime, network or DB.
// Process-wide module stand-ins require the isolated child-process wrapper.
const source = new URL("../../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
let profile = {
  id: "actor-a",
  businessId: "business-a",
  role: "MANAGER",
  staffAccessMode: "LEGACY" as "LEGACY" | "SCOPED",
}
let offline = false
let storeId = "store-a"
let balanceError = false
let availabilityError = false
let availabilityFetching = false
let availabilityFetchedAfterMount = true
let fetching = false
let fetchedAfterMount = true
let rows: StockBalance[] = []
let presented = 0
let dismissed = 0
let completed = 0
let nonce = 0
type StockActivity = Parameters<Parameters<typeof useStockActivity>[1]>[0]
const activity: StockActivity[] = []
const trackActivity = (event: StockActivity) => {
  activity.push(event)
}
let balancesUpdatedAt = 123
const requests: { kind: string; input: unknown }[] = []
const invalidated: unknown[] = []
const refetched: string[] = []
let invalidationResult: (filter: unknown) => Promise<unknown> = async () =>
  undefined
let mutationResult: (kind: string, input: unknown) => Promise<unknown> =
  async () => ({ id: "accepted" })
const modal = {
  present: () => {
    presented++
  },
  dismiss: () => {
    dismissed++
  },
}
standIn("components/ui/modal", { useModal: () => modal })
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
standIn("internal-tooling/fixture-recipes", {
  createInventoryFixture: () => {
    throw Error("QA fixture generation is outside this hook test")
  },
})
const useOperationalModeStore = Object.assign(
  (selector: (state: { isOfflineMode: boolean }) => unknown) =>
    selector({ isOfflineMode: offline }),
  { getState: () => ({ isOfflineMode: offline }) },
)
standIn("store/operationalModeStore", { useOperationalModeStore })
mock.module("expo-crypto", () => ({ randomUUID: () => `uuid-${++nonce}` }))
mock.module("react-native", () => ({ Keyboard: { dismiss() {} } }))
function procedure(kind: string) {
  return {
    queryOptions: (input: unknown, options: Record<string, unknown>) => ({
      queryKey: [kind, input],
      ...options,
    }),
    mutationOptions: () => ({ kind }),
    queryFilter: () => ({ queryKey: [kind] }),
    pathFilter: () => ({ queryKey: [kind] }),
  }
}
const trpc = {
  tenant: { featureAvailability: procedure("availability") },
  inventory: {
    balanceReport: procedure("balances"),
    postBalanceOperation: procedure("post"),
    createStockCount: procedure("count"),
    finalizeStockCount: procedure("finalize"),
    moveCustody: procedure("move"),
    operationHistory: procedure("history"),
    categorySuggestions: procedure("categories"),
  },
  services: { assignees: procedure("assignees") },
  catalog: { listItemsPage: procedure("catalog") },
}
standIn("trpc/client", { useTRPC: () => trpc })
mock.module("@tanstack/react-query", () => ({
  useQuery: ({ queryKey: [kind] }: { queryKey: string[] }) => {
    if (kind === undefined) throw Error("Query kind is required")
    const isError = kind === "balances" ? balanceError : availabilityError
    return {
      data:
        kind === "balances"
          ? { rows }
          : kind === "availability"
            ? { storeId }
            : [],
      error: isError ? Error("Read refused") : null,
      isError,
      isPending: false,
      isFetching:
        kind === "balances"
          ? fetching
          : kind === "availability" && availabilityFetching,
      isFetchedAfterMount:
        kind === "availability"
          ? availabilityFetchedAfterMount
          : fetchedAfterMount,
      dataUpdatedAt: kind === "balances" ? balancesUpdatedAt : 123,
      refetch: async () => {
        refetched.push(kind)
      },
    }
  },
  useMutation: ({ kind }: { kind: string }) => ({
    mutateAsync: async (input: unknown) => {
      requests.push({ kind, input: structuredClone(input) })
      return mutationResult(kind, input)
    },
  }),
  useQueryClient: () => ({
    invalidateQueries: async (filter: unknown) => {
      invalidated.push(filter)
      return invalidationResult(filter)
    },
  }),
}))
const { useStockIntake } = await import(
  "../../components/mobile/stock-intake/use-stock-intake"
)
type Model = ReturnType<typeof useStockIntake>
const baseRow = {
  balanceSourceId: "balance-a",
  catalogItemId: "item-a",
  storeId: "store-a",
  storeName: "Ikeja",
  productId: "product-a",
  productName: "Milk",
  variantId: "variant-a",
  variantName: "Tin",
  configurationVersionId: "config-a",
  kind: "PACKAGED_STOCK",
  custodyType: "STORE",
  custodyReferenceId: null,
  inventoryUnitId: "unit-a",
  inventoryUnitName: "Tin",
  inventoryUnitFactor: "1",
  inventoryUnitTransactionScale: 0,
  onHandQuantity: "120",
  reservedQuantity: "24",
  availableQuantity: "96",
  revision: 4,
} as StockBalance
const row = (patch: Partial<StockBalance> = {}): StockBalance => ({
  ...baseRow,
  ...patch,
})
const catalog = (patch: Record<string, string> = {}): ParsedStockIntakeTarget =>
  parseStockIntakeTarget({
    catalogItemId: "item-a",
    storeId: "store-a",
    ...patch,
  })

function reset() {
  profile = {
    id: "actor-a",
    businessId: "business-a",
    role: "MANAGER",
    staffAccessMode: "LEGACY",
  }
  offline = false
  storeId = "store-a"
  balanceError = false
  availabilityError = false
  availabilityFetching = false
  availabilityFetchedAfterMount = true
  fetching = false
  fetchedAfterMount = true
  rows = [row()]
  presented = dismissed = completed = nonce = 0
  activity.length = 0
  balancesUpdatedAt = 123
  requests.length = invalidated.length = refetched.length = 0
  invalidationResult = async () => undefined
  mutationResult = async () => ({ id: "accepted" })
}

async function mount(initialTarget = catalog()) {
  let target = initialTarget
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
  let latest: Model | undefined
  function Probe({ target }: { target: ParsedStockIntakeTarget }) {
    latest = useStockIntake({
      target,
      onComplete: () => {
        completed++
      },
    })
    useStockActivity(latest, trackActivity)
    return null
  }
  const ui = {
    get model(): Model {
      if (!latest) throw Error("Hook did not mount")
      return latest
    },
    render: async (next = target) => {
      target = next
      await act(async () => root.render(createElement(Probe, { target })))
    },
    run: async (operation: () => unknown) => {
      await act(async () => {
        await operation()
      })
    },
    close: async () => {
      await act(async () => root.unmount())
    },
  }
  await ui.render()
  return ui
}

async function prepare(ui: Awaited<ReturnType<typeof mount>>) {
  // An explicit user choice is deliberate; never reproduce hook side effects.
  await ui.run(() =>
    ui.model.edit({
      balanceId: "balance-a",
      quantity: "2",
      categories: [{ name: "Delivery" }],
    }),
  )
  await ui.run(() => ui.model.openReview())
  expect(ui.model.review?.balance.balanceSourceId).toBe("balance-a")
  return { open: ui.model.openReview, confirm: ui.model.confirm }
}

test("catalog hook exposes only exact item and current Store facts", async () => {
  reset()
  rows = [
    row({ balanceSourceId: "balance-b", catalogItemId: "item-b" }),
    row(),
    row({ balanceSourceId: "foreign", storeId: "store-b" }),
  ]
  const ui = await mount()
  try {
    expect(ui.model.rows.map((source) => source.balanceSourceId)).toEqual([
      "balance-a",
    ])
    expect(ui.model.selected).toEqual(baseRow)
    expect(ui.model.selected?.onHandQuantity).toBe("120")
    expect(ui.model.selected?.reservedQuantity).toBe("24")
    expect(ui.model.selected?.availableQuantity).toBe("96")
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      kind: "post",
      input: {
        balanceSourceId: "balance-a",
        storeId: "store-a",
        expectedBalanceRevision: 4,
        expectedConfigurationVersionId: "config-a",
        enteredInventoryUnitId: "unit-a",
        enteredQuantity: "2",
      },
    })
  } finally {
    await ui.close()
  }
})

test("the only eligible catalog balance can review without a redundant user choice", async () => {
  reset()
  const ui = await mount()
  try {
    expect(ui.model.selected?.balanceSourceId).toBe("balance-a")
    await ui.run(() =>
      ui.model.edit({ quantity: "2", categories: [{ name: "Delivery" }] }),
    )
    await ui.run(() => ui.model.openReview())
    expect(ui.model.review?.balance.balanceSourceId).toBe("balance-a")
  } finally {
    await ui.close()
  }
})

for (const [label, patch] of [
  ["variant", { variantId: "variant-b", variantName: "Bag" }],
  [
    "unit",
    {
      inventoryUnitId: "unit-b",
      inventoryUnitName: "Carton",
      inventoryUnitFactor: "24",
    },
  ],
  ["custody", { custodyType: "STAFF", custodyReferenceId: "staff-a" }],
] as const) {
  test(`ambiguous ${label} requires an explicit balance choice even after display search`, async () => {
    reset()
    rows = [row(), row({ ...patch, balanceSourceId: "balance-other" })]
    const ui = await mount()
    try {
      expect(ui.model.resolution).toBe("choose")
      expect(ui.model.selected).toBeUndefined()
      await ui.run(() => ui.model.setQuery("Tin"))
      expect(ui.model.selected).toBeUndefined()
      expect(ui.model.canReview).toBe(false)
      await ui.run(() => ui.model.openReview())
      expect(ui.model.review).toBeNull()
      await prepare(ui)
      expect(requests).toHaveLength(0)
    } finally {
      await ui.close()
    }
  })
}

test("malformed catalog target never becomes generic stock intake", async () => {
  reset()
  const ui = await mount(parseStockIntakeTarget({ catalogItemId: ["item-a"] }))
  try {
    expect(ui.model.resolution).toBe("invalid")
    expect(ui.model.rows).toEqual([])
    await ui.run(() =>
      ui.model.edit({
        balanceId: "balance-a",
        quantity: "2",
        categories: [{ name: "Delivery" }],
      }),
    )
    await ui.run(() => ui.model.openReview())
    await ui.run(() => ui.model.confirm())
    expect(ui.model.review).toBeNull()
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

const invalidations: [string, () => ParsedStockIntakeTarget | undefined][] = [
  ["target", () => catalog({ catalogItemId: "item-b" })],
  [
    "Store",
    () => {
      storeId = "store-b"
      return undefined
    },
  ],
  [
    "user",
    () => {
      profile = { ...profile, id: "actor-b" }
      return undefined
    },
  ],
  [
    "business",
    () => {
      profile = { ...profile, businessId: "business-b" }
      return undefined
    },
  ],
  [
    "access",
    () => {
      profile = { ...profile, role: "CASHIER" }
      return undefined
    },
  ],
  [
    "offline",
    () => {
      offline = true
      return undefined
    },
  ],
  [
    "loading cached rows",
    () => {
      fetching = true
      fetchedAfterMount = false
      return undefined
    },
  ],
  [
    "balance read error",
    () => {
      balanceError = true
      return undefined
    },
  ],
  [
    "availability read error",
    () => {
      availabilityError = true
      return undefined
    },
  ],
  [
    "source disappearance",
    () => {
      rows = [row({ balanceSourceId: "replacement" })]
      return undefined
    },
  ],
  [
    "source revision",
    () => {
      rows = [row({ revision: 5 })]
      return undefined
    },
  ],
  [
    "configuration",
    () => {
      rows = [row({ configurationVersionId: "config-b" })]
      return undefined
    },
  ],
]
for (const [label, invalidate] of invalidations) {
  test(`${label} change retires review and captured Review/Confirm callbacks`, async () => {
    reset()
    const ui = await mount()
    try {
      const captured = await prepare(ui)
      const next = invalidate()
      await ui.render(next)
      expect(ui.model.review).toBeNull()
      await ui.run(captured.confirm)
      expect(requests).toHaveLength(0)
      // Invoke the exact old closure, not a new render's disabled UI handler.
      await ui.run(captured.open)
      const resurrected = ui.model.review
      await ui.run(captured.confirm)
      expect(requests).toHaveLength(0)
      expect(resurrected).toBeNull()
      expect(completed).toBe(0)
    } finally {
      await ui.close()
    }
  })
}

test("vanished explicit source never silently selects a remaining eligible source", async () => {
  reset()
  rows = [row(), row({ balanceSourceId: "replacement" })]
  const ui = await mount()
  try {
    await prepare(ui)
    rows = [row({ balanceSourceId: "replacement" })]
    await ui.render()
    expect(ui.model.resolution).toBe("selection_missing")
    expect(ui.model.selected).toBeUndefined()
    expect(ui.model.canReview).toBe(false)
    expect(ui.model.review).toBeNull()
  } finally {
    await ui.close()
  }
})

for (const [label, invalidate] of invalidations) {
  test(`recovery from ${label} never revives retired Review/Confirm callbacks`, async () => {
    reset()
    const ui = await mount()
    try {
      const captured = await prepare(ui)
      await ui.render(invalidate())
      expect(ui.model.review).toBeNull()
      // Restore the exact original scope/read identity without resetting hook
      // state, requests, nonce, React effects, or retained callback references.
      profile = {
        id: "actor-a",
        businessId: "business-a",
        role: "MANAGER",
        staffAccessMode: "LEGACY",
      }
      storeId = "store-a"
      offline = balanceError = availabilityError = fetching = false
      fetchedAfterMount = true
      rows = [row()]
      await ui.render(catalog())
      expect(ui.model.canReview).toBe(true)
      await ui.run(captured.open)
      await ui.run(captured.confirm)
      expect(requests).toHaveLength(0)
      expect(ui.model.review).toBeNull()
      // Current callbacks remain usable; recovery must not dead-end the form.
      await ui.run(() => ui.model.openReview())
      expect(ui.model.review?.balance.revision).toBe(4)
    } finally {
      await ui.close()
    }
  })
}

test("retained Review and Confirm callbacks cannot post after unmount", async () => {
  reset()
  const ui = await mount()
  const captured = await prepare(ui)
  await ui.close()
  await ui.run(captured.open)
  await ui.run(captured.confirm)
  expect(requests).toHaveLength(0)
  expect(completed).toBe(0)
})

test("uncertain operation retries the identical request and completes once", async () => {
  reset()
  mutationResult = async () => {
    throw Error("Response lost after submit")
  }
  const ui = await mount()
  try {
    await prepare(ui)
    const confirm = ui.model.confirm
    await ui.run(confirm)
    expect(ui.model.phase).toBe("retry")
    expect(ui.model.hasAttempt).toBe(true)
    expect(requests).toHaveLength(1)
    expect(completed).toBe(0)
    // A new source revision does not manufacture a second operation identity.
    rows = [row({ revision: 5 })]
    await ui.render()
    mutationResult = async () => ({ id: "accepted-existing-request" })
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(ui.model.phase).toBe("complete")
    expect(completed).toBe(1)
    expect(invalidated).toHaveLength(5)
    await ui.run(confirm)
    expect(requests).toHaveLength(2)
    expect(presented).toBeGreaterThan(0)
    expect(dismissed).toBeGreaterThan(0)
  } finally {
    await ui.close()
  }
})

test("uncertain attempt stays locked offline and resumes with its original operation identity", async () => {
  reset()
  mutationResult = async () => {
    throw Error("Response lost after submit")
  }
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
    offline = true
    await ui.render()
    await ui.run(() => ui.model.edit({ quantity: "99" }))
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
    expect(ui.model.draft.quantity).toBe("2")
    expect(ui.model.hasAttempt).toBe(true)
    offline = false
    await ui.render()
    mutationResult = async () => ({ id: "accepted-original-request" })
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(completed).toBe(1)
  } finally {
    await ui.close()
  }
})

test("first-mount cached availability cannot authorize a Store before its fresh read", async () => {
  reset()
  availabilityFetching = true
  availabilityFetchedAfterMount = false
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.edit({ quantity: "2", categories: [{ name: "Delivery" }] }),
    )
    await ui.run(() => ui.model.openReview())
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(0)
    expect(ui.model.selected).toBeUndefined()
    expect(ui.model.canReview).toBe(false)
    expect(ui.model.loading).toBe(true)
  } finally {
    await ui.close()
  }
})

test("idle cached availability and balances require a read in this screen lifetime", async () => {
  reset()
  // Real QueryObserver state with the app's 60-second staleTime and a cache
  // populated before mount: no refetch begins and isFetchedAfterMount=false.
  // An idle cached result cannot satisfy the screen's fresh-read contract.
  availabilityFetching = fetching = false
  availabilityFetchedAfterMount = fetchedAfterMount = false
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.edit({ quantity: "2", categories: [{ name: "Delivery" }] }),
    )
    await ui.run(() => ui.model.openReview())
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(0)
    expect(ui.model.selected).toBeUndefined()
    expect(ui.model.canReview).toBe(false)
    availabilityFetchedAfterMount = fetchedAfterMount = true
    await ui.render()
    expect(ui.model.selected?.balanceSourceId).toBe("balance-a")
    await ui.run(() => ui.model.openReview())
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("retired Confirm cannot submit a later generation's newly reviewed balance", async () => {
  reset()
  const ui = await mount()
  try {
    const captured = await prepare(ui)
    rows = [row({ revision: 5 })]
    await ui.render()
    expect(ui.model.review).toBeNull()
    await ui.run(() => ui.model.openReview())
    expect(ui.model.review?.balance.revision).toBe(5)
    await ui.run(captured.confirm)
    expect(requests).toHaveLength(0)
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ input: { expectedBalanceRevision: 5 } })
  } finally {
    await ui.close()
  }
})

test("retired edit callback cannot replace a newer balance choice, quantity or reason", async () => {
  reset()
  rows = [
    row(),
    row({ balanceSourceId: "balance-new", variantId: "variant-new" }),
  ]
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.edit({
        balanceId: "balance-a",
        quantity: "2",
        reason: "Current delivery",
      }),
    )
    const capturedEdit = ui.model.edit
    await ui.run(() => ui.model.edit({ balanceId: "balance-new" }))
    expect(ui.model.selected?.balanceSourceId).toBe("balance-new")
    await ui.run(() =>
      capturedEdit({
        balanceId: "balance-a",
        quantity: "99",
        reason: "Old delivery",
      }),
    )
    expect(ui.model.selected?.balanceSourceId).toBe("balance-new")
    expect(ui.model.draft.quantity).toBe("2")
    expect(ui.model.draft.reason).toBe("Current delivery")
    await ui.run(() => ui.model.edit({ quantity: "3" }))
    expect(ui.model.draft.quantity).toBe("3")
  } finally {
    await ui.close()
  }
})

const refused = (code: string) =>
  Object.assign(Error(`Server refused: ${code}`), {
    data: { code, httpStatus: code === "CONFLICT" ? 409 : 403 },
  })
const effectiveAt = "2026-10-17T10:30:00.000Z"

test("structured denial exposes an editable retained draft and a deliberate new review", async () => {
  reset()
  mutationResult = async () => {
    throw refused("BAD_REQUEST")
  }
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(ui.model.outcome).toMatchObject({
      kind: "not_recorded",
      canEdit: true,
    })
    expect(ui.model.hasAttempt).toBe(false)
    expect(ui.model.draft.quantity).toBe("2")
    await ui.run(() => ui.model.editAfterFailure())
    expect(ui.model.outcome).toBeNull()
    expect(ui.model.review).toBeNull()
    await ui.run(() => ui.model.edit({ quantity: "3" }))
    await ui.run(() => ui.model.openReview())
    mutationResult = async () => ({ id: "new-operation", effectiveAt })
    await ui.run(() => ui.model.confirm())
    expect(ui.model.outcome).toMatchObject({
      kind: "recorded",
      effectiveAt: new Date(effectiveAt),
    })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.input).toMatchObject({ enteredQuantity: "3" })
    expect(requests[1]?.input).not.toEqual(requests[0]?.input)
    expect(completed).toBe(1)
  } finally {
    await ui.close()
  }
})

for (const code of ["FORBIDDEN", "CONFLICT"]) {
  test(`a lost response remains unknown after later ${code}, preserving its exact attempt`, async () => {
    reset()
    mutationResult = async () => {
      throw Error("Response lost")
    }
    const ui = await mount()
    try {
      await prepare(ui)
      await ui.run(() => ui.model.confirm())
      expect(ui.model.outcome?.kind).toBe("unknown")
      mutationResult = async () => {
        throw refused(code)
      }
      await ui.run(() => ui.model.confirm())
      expect(ui.model.outcome?.kind).toBe("unknown")
      expect(ui.model.hasAttempt).toBe(true)
      expect(ui.model.reviewStale).toBe(false)
      await ui.run(() => ui.model.editAfterFailure())
      await ui.run(() => ui.model.refreshReview())
      await ui.run(() => ui.model.edit({ quantity: "99" }))
      expect(ui.model.draft.quantity).toBe("2")
      expect(ui.model.hasAttempt).toBe(true)
      expect(requests).toHaveLength(2)
      expect(requests[1]).toEqual(requests[0])
      expect(completed).toBe(0)
    } finally {
      await ui.close()
    }
  })
}

test("lost response followed by accepted retry records once with original identity and server time", async () => {
  reset()
  mutationResult = async () => {
    throw Error("Response lost")
  }
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(ui.model.outcome?.kind).toBe("unknown")
    mutationResult = async () => ({ id: "accepted-original", effectiveAt })
    await ui.run(() => ui.model.confirm())
    expect(ui.model.outcome).toMatchObject({
      kind: "recorded",
      operationId: "accepted-original",
      effectiveAt: new Date(effectiveAt),
    })
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(completed).toBe(1)
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(2)
    expect(completed).toBe(1)
  } finally {
    await ui.close()
  }
})

test("post-success rejected refresh stays recorded and cannot resend the mutation", async () => {
  reset()
  invalidationResult = async () => {
    throw Error("Balance refresh failed")
  }
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(ui.model.outcome?.kind).toBe("recorded")
    expect(ui.model.outcome).toMatchObject({ operationId: "accepted" })
    expect(ui.model.refreshFailed).toBe(true)
    expect(ui.model.phase).toBe("complete")
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
    expect(completed).toBe(1)
  } finally {
    await ui.close()
  }
})

test("resolved invalidation with a failed balance query still reports recorded refresh failure", async () => {
  reset()
  // TanStack invalidateQueries defaults throwOnError=false: failed refetches
  // normally resolve while the query itself reports isError=true.
  invalidationResult = async () => {
    balanceError = true
  }
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    await ui.render()
    expect(ui.model.outcome?.kind).toBe("recorded")
    expect(requests).toHaveLength(1)
    expect(ui.model.refreshFailed).toBe(true)
    expect(ui.model.recordedBalance).toBeUndefined()
  } finally {
    await ui.close()
  }
})

test("a precommit stock conflict requires the requested fresh read before a new review", async () => {
  reset()
  mutationResult = async () => {
    throw refused("CONFLICT")
  }
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(ui.model.reviewStale).toBe(true)
    expect(ui.model.hasAttempt).toBe(false)
    await ui.run(() => ui.model.refreshReview())
    expect(refetched).toContain("balances")
    fetching = true
    await ui.render()
    expect(ui.model.review).toBeNull()
    expect(ui.model.canReview).toBe(false)
    await ui.run(() => ui.model.openReview())
    expect(ui.model.review).toBeNull()
    rows = [row({ revision: 5 })]
    balancesUpdatedAt = 124
    fetching = false
    await ui.render()
    await ui.run(() => ui.model.openReview())
    expect(ui.model.review?.balance.revision).toBe(5)
    mutationResult = async () => ({ id: "fresh-operation", effectiveAt })
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(2)
    expect(requests[1]?.input).toMatchObject({ expectedBalanceRevision: 5 })
    expect(requests[1]?.input).not.toEqual(requests[0]?.input)
  } finally {
    await ui.close()
  }
})

test("a created Count draft survives finalization denial and retries only its original finalization", async () => {
  reset()
  mutationResult = async (kind) => {
    if (kind === "count") return { id: "saved-count" }
    throw refused("FORBIDDEN")
  }
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.edit({ mode: "count", quantity: "2", reason: "Physical count" }),
    )
    await ui.run(() => ui.model.openReview())
    await ui.run(() => ui.model.confirm())
    expect(requests.map((request) => request.kind)).toEqual([
      "count",
      "finalize",
    ])
    expect(ui.model.outcome).toMatchObject({
      kind: "not_recorded",
      canEdit: false,
    })
    expect(ui.model.hasAttempt).toBe(true)
    expect(ui.model.hasCountDraft).toBe(true)
    await ui.run(() => ui.model.editAfterFailure())
    await ui.run(() => ui.model.refreshReview())
    expect(ui.model.hasCountDraft).toBe(true)
    mutationResult = async () => ({ id: "final-operation", effectiveAt })
    await ui.run(() => ui.model.confirm())
    expect(requests.map((request) => request.kind)).toEqual([
      "count",
      "finalize",
      "finalize",
    ])
    expect(requests[2]).toEqual(requests[1])
    expect(requests[2]?.input).toMatchObject({ stockCountId: "saved-count" })
    expect(ui.model.outcome?.kind).toBe("recorded")
    expect(completed).toBe(1)
  } finally {
    await ui.close()
  }
})

test("a successfully refreshed zero-difference Count exposes its unchanged canonical balance", async () => {
  reset()
  mutationResult = async (kind) =>
    kind === "count" ? { id: "zero-count" } : { id: "zero-final", effectiveAt }
  // Canonical finalization skips revision increments for varianceQuantity=0.
  invalidationResult = async () => {
    balancesUpdatedAt = 124
  }
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.edit({
        mode: "count",
        quantity: "120",
        reason: "Physical count matches",
      }),
    )
    await ui.run(() => ui.model.openReview())
    await ui.run(() => ui.model.confirm())
    await ui.render()
    expect(ui.model.outcome?.kind).toBe("recorded")
    expect(ui.model.refreshFailed).toBe(false)
    expect(ui.model.recordedBalance).toMatchObject({
      revision: 4,
      onHandQuantity: "120",
      reservedQuantity: "24",
      availableQuantity: "96",
    })
    expect(requests.map((request) => request.kind)).toEqual([
      "count",
      "finalize",
    ])
  } finally {
    await ui.close()
  }
})

test("late success after switching business never exposes the original business outcome", async () => {
  reset()
  let resolve!: (result: unknown) => void
  mutationResult = () =>
    new Promise((done) => {
      resolve = done
    })
  const ui = await mount()
  try {
    await prepare(ui)
    let pending!: Promise<void>
    await ui.run(() => {
      pending = ui.model.confirm()
    })
    profile = { ...profile, businessId: "business-b", id: "actor-b" }
    await ui.render()
    await ui.run(() => {
      resolve({ id: "saved-in-original-business", effectiveAt })
      return pending
    })
    expect(requests).toHaveLength(1)
    expect(completed).toBe(0)
    expect(ui.model.outcome).toBeNull()
  } finally {
    await ui.close()
  }
})

test("a recorded outcome is withheld after the active business changes", async () => {
  reset()
  const ui = await mount()
  try {
    await prepare(ui)
    await ui.run(() => ui.model.confirm())
    expect(ui.model.outcome?.kind).toBe("recorded")
    profile = { ...profile, businessId: "business-b", id: "actor-b" }
    await ui.render()
    expect(ui.model.scopeChanged).toBe(true)
    expect(ui.model.outcome).toBeNull()
  } finally {
    await ui.close()
  }
})

test("late success after unmount causes no outcome-modal or completion callback effects", async () => {
  reset()
  let resolve!: (result: unknown) => void
  mutationResult = () =>
    new Promise((done) => {
      resolve = done
    })
  const ui = await mount()
  await prepare(ui)
  let pending!: Promise<void>
  await ui.run(() => {
    pending = ui.model.confirm()
  })
  await ui.close()
  const priorDismissed = dismissed
  await ui.run(() => {
    resolve({ id: "saved-after-unmount", effectiveAt })
    return pending
  })
  expect(requests).toHaveLength(1)
  expect(completed).toBe(0)
  expect(dismissed).toBe(priorDismissed)
  expect(ui.model.outcome).toBeNull()
})

test("a definitive error result cannot mint another operation through a retained Confirm callback", async () => {
  reset()
  mutationResult = async () => {
    throw refused("FORBIDDEN")
  }
  const ui = await mount()
  try {
    const captured = await prepare(ui)
    await ui.run(captured.confirm)
    expect(ui.model.outcome).toMatchObject({
      kind: "not_recorded",
      canEdit: true,
    })
    await ui.run(captured.confirm)
    expect(requests).toHaveLength(1)
    expect(completed).toBe(0)
  } finally {
    await ui.close()
  }
})

test("lost stock access hides a recorded result, balance and activity while retaining private recovery", async () => {
  for (const denied of [
    { role: "CASHIER", staffAccessMode: "LEGACY" as const },
    { role: "OPERATOR", staffAccessMode: "LEGACY" as const },
  ]) {
    reset()
    invalidationResult = async () => {
      balancesUpdatedAt = 124
      rows = [
        row({ revision: 5, onHandQuantity: "122", availableQuantity: "98" }),
      ]
    }
    const ui = await mount()
    try {
      await prepare(ui)
      await ui.run(() => ui.model.confirm())
      await ui.render()
      expect(ui.model.outcome?.kind).toBe("recorded")
      expect(ui.model.recordedBalance?.onHandQuantity).toBe("122")
      const priorActivity = [...activity]
      const original = profile
      profile = { ...profile, ...denied }
      await ui.render()
      expect(ui.model.canManage).toBe(false)
      expect(ui.model.outcome).toBeNull()
      expect(ui.model.recordedBalance).toBeUndefined()
      expect(ui.model.pending).toBe(false)
      expect(activity).toEqual(priorActivity)
      await ui.run(() => ui.model.confirm())
      expect(requests).toHaveLength(1)
      profile = original
      await ui.render()
      expect(ui.model.canManage).toBe(true)
      expect(ui.model.outcome?.kind).toBe("recorded")
      expect(ui.model.phase).toBe("complete")
      expect(ui.model.recordedBalance?.onHandQuantity).toBe("122")
      expect(activity).toEqual(priorActivity)
      expect(completed).toBe(1)
    } finally {
      await ui.close()
    }
  }
})

test("success received in another scope stays private and restores recorded completion on returning", async () => {
  reset()
  let resolve!: (value: unknown) => void
  mutationResult = () =>
    new Promise((done) => {
      resolve = done
    })
  const ui = await mount()
  try {
    await prepare(ui)
    let pending!: Promise<void>
    await ui.run(() => {
      pending = ui.model.confirm()
    })
    const original = profile
    const priorActivity = [...activity]
    profile = { ...profile, id: "actor-b", businessId: "business-b" }
    await ui.render()
    await ui.run(() => {
      resolve({ id: "saved-original-operation", effectiveAt })
      return pending
    })
    expect(ui.model.scopeChanged).toBe(true)
    expect(ui.model.outcome).toBeNull()
    expect(ui.model.recordedBalance).toBeUndefined()
    expect(ui.model.pending).toBe(false)
    expect(activity).toEqual(priorActivity)
    expect(completed).toBe(0)
    profile = original
    await ui.render()
    expect(ui.model.scopeChanged).toBe(false)
    expect(ui.model.outcome).toMatchObject({
      kind: "recorded",
      effectiveAt: new Date(effectiveAt),
    })
    expect(ui.model.phase).toBe("complete")
    expect(ui.model.pending).toBe(false)
    expect(ui.model.canReview).toBe(false)
    expect(
      activity
        .filter((event) => event.name === "mobile_stock_result")
        .map((event) => event.properties.status),
    ).toEqual(["recorded"])
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(1)
    expect(completed).toBe(0)
  } finally {
    await ui.close()
  }
})

test("an unknown result received out of scope restores only the original attempt for reconciliation", async () => {
  reset()
  let reject!: (error: Error) => void
  mutationResult = () =>
    new Promise((_resolve, fail) => {
      reject = fail
    })
  const ui = await mount()
  try {
    await prepare(ui)
    let pending!: Promise<void>
    await ui.run(() => {
      pending = ui.model.confirm()
    })
    const original = profile
    const priorActivity = [...activity]
    profile = { ...profile, id: "actor-b", businessId: "business-b" }
    await ui.render()
    await ui.run(() => {
      reject(Error("Response lost"))
      return pending
    })
    expect(ui.model.outcome).toBeNull()
    expect(ui.model.pending).toBe(false)
    expect(ui.model.hasAttempt).toBe(true)
    expect(activity).toEqual(priorActivity)
    expect(completed).toBe(0)
    profile = original
    await ui.render()
    expect(ui.model.outcome?.kind).toBe("unknown")
    expect(ui.model.phase).toBe("retry")
    expect(ui.model.hasAttempt).toBe(true)
    mutationResult = async () => ({
      id: "original-operation-reconciled",
      effectiveAt,
    })
    await ui.run(() => ui.model.confirm())
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(ui.model.outcome?.kind).toBe("recorded")
    expect(ui.model.phase).toBe("complete")
    expect(
      activity
        .filter((event) => event.name === "mobile_stock_result")
        .map((event) => event.properties.status),
    ).toEqual(["unknown", "recorded"])
    expect(completed).toBe(1)
  } finally {
    await ui.close()
  }
})

for (const [mode, operationId, kinds] of [
  ["receipt", "22222222-2222-4222-8222-222222222222", ["post"]],
  ["count", "33333333-3333-4333-8333-333333333333", ["count", "finalize"]],
  ["custody", "44444444-4444-4444-8444-444444444444", ["move"]],
] as const) {
  test(`actual stock saved reference: ${mode} retains the canonical operation id`, async () => {
    reset()
    if (mode === "custody")
      rows = [row({ custodyType: "STAFF", custodyReferenceId: "staff-a" })]
    mutationResult = async (kind) => ({
      id:
        kind === "count" ? "11111111-1111-4111-8111-111111111111" : operationId,
      effectiveAt,
    })
    const ui = await mount()
    try {
      await ui.run(() =>
        ui.model.edit({
          mode,
          balanceId: "balance-a",
          quantity: "2",
          reason: "Verified stock",
          categories: [{ name: "Delivery" }],
          targetCustodyType: "store",
        }),
      )
      await ui.run(() => ui.model.openReview())
      expect(ui.model.review).not.toBeNull()
      await ui.run(() => ui.model.confirm())
      expect(requests.map((request) => request.kind)).toEqual([...kinds])
      expect(ui.model.outcome).toMatchObject({ kind: "recorded", operationId })
    } finally {
      await ui.close()
    }
  })
}
