import { beforeEach, expect, mock, test } from "bun:test"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  createDraftJobHandoffStore,
  type DraftJobHandoff,
} from "../general-assistant/assistant-draft-job-handoff-state"

// Actual production factory and Job sheet; URL, query, overlay subscription and
// visual primitives are isolated boundaries. No DOM, network or saved records.
const handoffs = createDraftJobHandoffStore()
const handoff: DraftJobHandoff = {
  token: "owned-token",
  draftKey: "unchanged-proposal-revision",
  scope: { actorUserId: "actor", tenantId: "tenant", storeId: "store" },
  membershipId: "member",
  staffRevision: 4,
  jobId: "owned-job",
  jobStoreId: "other-store",
  jobRevision: 8,
  assigneeUserId: "assignee",
}
let pathname = "/assistant/c/synthetic-conversation"
let url = {
  jobId: "owned-job" as string | null,
  serviceSheet: "job" as string | null,
  requestId: "keep-request",
  serviceQuery: "keep-filter",
  conversation: "keep-chat",
}
let urlFailure = false
let closeError: string | null = null
let closePromise: Promise<void> | undefined
let sheetChange: ((open: boolean) => void) | undefined
let readsEnabled: boolean[] = []
let urlUpdates: unknown[] = []
let invalidations = 0
let releaseSawInvalidation = false
const reviewKey = ["retailOps", "staffStoreAccessReview"]

mock.module("next/navigation", () => ({ usePathname: () => pathname }))
mock.module("@/hooks/use-catalog-item-params", () => ({
  useCatalogItemParams: () => ({ setCatalogItemMode: () => {} }),
}))
mock.module("@/hooks/use-service-work-params", () => ({
  useServiceWorkParams: () => ({
    jobId: url.jobId,
    sheet: url.serviceSheet,
    setParams: async (values: Partial<typeof url> | null) => {
      urlUpdates.push(values)
      if (urlFailure) throw new Error("Synthetic URL failure")
      url = {
        ...url,
        ...(values ?? { jobId: null, serviceSheet: null, requestId: "" }),
      }
    },
  }),
}))
mock.module("@/hooks/use-assistant-draft-job-handoff", () => ({
  useAssistantDraftJobOverlay: () => handoffs.getSnapshot(),
  releaseAssistantDraftJobOverlay: (
    token: string,
    beforeRelease?: () => void,
  ) => {
    if (handoffs.getSnapshot()?.token !== token) return false
    beforeRelease?.()
    releaseSawInvalidation = invalidations > 0
    return handoffs.release(token)
  },
}))
mock.module("@/hooks/use-sheet-dismissal", () => ({
  useSheetDismissal: (close: () => Promise<unknown>) => ({
    closeError,
    requestClose: () => {
      closePromise = (async () => {
        closeError = null
        try {
          await close()
        } catch {
          closeError = "Synthetic URL failure"
        }
      })()
      return closePromise
    },
  }),
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    retailOps: { staffStoreAccessReview: { queryKey: () => reviewKey } },
  }),
  useTRPCClient: () => ({
    tenant: {
      current: {
        query: () => {
          throw new Error("Network forbidden in source fixture")
        },
      },
    },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { enabled: boolean }) => {
    readsEnabled.push(options.enabled)
    // Deliberately warm authorized cache even after factory access is revoked.
    return {
      data: {
        actorUserId: "actor",
        tenant: { id: "tenant" },
        activeStore: { id: "store" },
      },
      isPending: false,
      isFetching: false,
      isPaused: false,
      isError: false,
      isSuccess: true,
      isFetchedAfterMount: true,
    }
  },
  useQueryClient: () => ({
    invalidateQueries: ({ queryKey }: { queryKey: unknown }) => {
      expect(queryKey).toEqual(reviewKey)
      invalidations++
      return Promise.resolve()
    },
  }),
}))
mock.module("@ewatrade/ui", () => ({
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }) => {
    sheetChange = onOpenChange
    return open ? <>{children}</> : null
  },
  Button: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))
mock.module("@/components/sheets/sheet-frame", () => ({
  SheetFrame: ({
    children,
    closeError,
  }: { children: ReactNode; closeError: string | null }) => (
    <section>
      <button type="button">Close</button>
      {closeError ? <p>{closeError}</p> : null}
      {children}
    </section>
  ),
}))
mock.module("@/components/service-work/service-job-workspace", () => ({
  ServiceJobWorkspace: () => <p>PRIVATE CACHED JOB FACTS</p>,
}))

// Keep unrelated factory imports out of this bounded integration regression.
for (const [path, name] of [
  ["@/components/catalog-item/catalog-appearance", "CatalogAppearance"],
  [
    "@/components/catalog-item/catalog-item-detail-modal",
    "CatalogItemDetailModal",
  ],
  ["@/components/catalog-item/catalog-item-sheet", "CatalogItemSheet"],
  ["./service-intake-receipt-sheet", "ServiceIntakeReceiptSheet"],
  ["./service-work-original-sheet", "ServiceWorkOriginalSheet"],
  ["./assistant-cash-count-sheet", "AssistantCashCountSheet"],
  ["./assistant-quote-approval-sheet", "AssistantQuoteApprovalSheet"],
  ["./assistant-booking-sheet", "AssistantBookingSheet"],
  ["./assistant-day-close-sheet", "AssistantDayCloseSheet"],
  ["./business-report-sheet", "BusinessReportSheet"],
  ["./closeout-sheet", "CloseoutSheet"],
  ["./customer-details-sheet", "CustomerDetailsSheet"],
  ["./customer-ledger-sheet", "CustomerLedgerSheet"],
  ["./domain-sheet", "DomainSheet"],
  ["./finance-movement-details-sheet", "FinanceMovementDetailsSheet"],
  ["./finance-sheet", "FinanceSheet"],
  ["./inventory-operation-details-sheet", "InventoryOperationDetailsSheet"],
  ["./order-details-sheet", "OrderDetailsSheet"],
  ["./prescription-request-sheet", "PrescriptionRequestSheet"],
  ["./purchase-bill-details-sheet", "PurchaseBillDetailsSheet"],
  ["./purchase-registration-details-sheet", "PurchaseRegistrationDetailsSheet"],
  ["./receipt-sheet", "ReceiptSheet"],
  ["./service-commerce-sheet", "ServiceCommerceSheet"],
  ["./staff-directory-sheet", "StaffDirectorySheet"],
  ["./staff-history-sheet", "StaffHistorySheet"],
  ["./staff-invitation-sheet", "StaffInvitationSheet"],
  ["./staff-member-sheet", "StaffMemberSheet"],
  ["./staff-status-sheet", "StaffStatusSheet"],
  ["./staff-access-sheet", "StaffAccessSheet"],
  ["./stock-count-sheet", "StockCountSheet"],
  ["./stock-transfer-details-sheet", "StockTransferDetailsSheet"],
  ["./store-conversation-sheet", "StoreConversationSheet"],
] as const)
  mock.module(path, () => ({ [name]: () => null }))

const { GlobalSheets } = await import("./global-sheets")
function render(serviceIntake: boolean) {
  return renderToStaticMarkup(
    <GlobalSheets
      access={{
        serviceIntake,
        sales: false,
        finance: false,
        prescriptions: false,
        managePrescriptionSetup: false,
      }}
      actorUserId="actor"
      tenantId="tenant"
      timeZone="UTC"
      storeIds={["store"]}
      store={{
        id: "store",
        name: "Selected Store",
        currencyCode: "NGN",
        businessProfileKey: null,
      }}
    />,
  )
}
beforeEach(() => {
  const current = handoffs.getSnapshot()
  if (current) handoffs.release(current.token)
  handoffs.claim(handoff)
  pathname = "/assistant/c/synthetic-conversation"
  url = {
    jobId: "owned-job",
    serviceSheet: "job",
    requestId: "keep-request",
    serviceQuery: "keep-filter",
    conversation: "keep-chat",
  }
  urlFailure = false
  closeError = null
  closePromise = undefined
  sheetChange = undefined
  readsEnabled = []
  urlUpdates = []
  invalidations = 0
  releaseSawInvalidation = false
})

test("granted then revoked factory keeps unavailable Close; successful Close releases only owned Job state", async () => {
  expect(render(true)).toContain("PRIVATE CACHED JOB FACTS")
  expect(readsEnabled).toEqual([true])
  const revoked = render(false)
  expect(readsEnabled).toEqual([true, false])
  expect(revoked).not.toContain("PRIVATE CACHED JOB FACTS")
  expect(revoked).toContain("Close the Job to return to your draft.")
  expect(revoked.match(/<button/g)).toHaveLength(1)
  expect(revoked).toContain(">Close</button>")
  expect(handoffs.getSnapshot()?.draftKey).toBe(handoff.draftKey)
  expect(sheetChange).toBeDefined()
  sheetChange?.(false)
  await closePromise
  expect(urlUpdates).toEqual([{ jobId: null, serviceSheet: null }])
  expect(url).toEqual({
    jobId: null,
    serviceSheet: null,
    requestId: "keep-request",
    serviceQuery: "keep-filter",
    conversation: "keep-chat",
  })
  expect(invalidations).toBe(1)
  expect(releaseSawInvalidation).toBe(true)
  expect(handoffs.getSnapshot()).toBeNull()
  expect(render(false)).toBe("")
  expect(readsEnabled).toEqual([true, false])
  // Removing the live owner unblocks GeneralChat's existing covering gate.
  // Real mounted dirty-form and keyboard/focus continuity require browser proof.
})

test("failed URL Close keeps owned unavailable sheet and token without revealing warm facts", async () => {
  urlFailure = true
  render(false)
  sheetChange?.(false)
  await closePromise
  expect(handoffs.getSnapshot()?.token).toBe(handoff.token)
  expect(url.jobId).toBe(handoff.jobId)
  expect(url.serviceSheet).toBe("job")
  expect(invalidations).toBe(0)
  const failed = render(false)
  expect(failed).toContain("Synthetic URL failure")
  expect(failed).toContain(">Close</button>")
  expect(failed).not.toContain("PRIVATE CACHED JOB FACTS")
  expect(readsEnabled).toEqual([false, false])
})

test("revocation does not mount ordinary or mismatched Jobs, or duplicate the services page owner", () => {
  handoffs.release(handoff.token)
  expect(render(false)).toBe("")
  handoffs.claim(handoff)
  url.jobId = "unowned-job"
  expect(render(false)).toBe("")
  url.jobId = handoff.jobId
  pathname = "/services"
  expect(render(false)).toBe("")
  expect(render(true)).toBe("")
  expect(readsEnabled).toEqual([])
  expect(urlUpdates).toEqual([])
  expect(handoffs.getSnapshot()?.token).toBe(handoff.token)
})
