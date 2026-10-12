import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { allowedServiceCommercePolicyDecisionRows } from "./service-commerce-policy"

export const decisionScope = {
  actorUserId: "checker-user",
  storeId: "store-1",
  tenantId: "tenant-1",
}
export function decision(id = "decision-01") {
  return {
    id,
    storeId: decisionScope.storeId,
    tenantId: decisionScope.tenantId,
    quoteId: `quote-${id}`,
    quoteVersionId: `version-${id}`,
    sourceId: `source-${id}`,
    sourceType: "SERVICE_REQUEST",
    status: "PENDING",
    decidedAt: null as Date | null,
    decidedByMembershipId: null as string | null,
    decisionClientId: null as string | null,
    decisionPayloadHash: null as string | null,
    reason: null as string | null,
    requesterMembershipId: "maker",
    policyRevision: 4,
    requestedAt: new Date("2026-01-01T00:00:00Z"),
    quote: { currentVersionId: `version-${id}` },
    quoteVersion: {
      id: `version-${id}`,
      quoteId: `quote-${id}`,
      createdByUserId: "maker-user",
      acceptanceTokenDigest: null as string | null,
      issuedAt: null as Date | null,
      status: "DRAFT",
      currencyCode: "NGN",
      totalMinor: 1000,
      version: 1,
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      options: [
        {
          id: `option-${id}`,
          label: "Original service",
          availabilityOutcome: "FULL",
          discountMinor: 0,
          fulfilmentFeeMinor: 0,
          taxMinor: 0,
          subtotalMinor: 1000,
          totalMinor: 1000,
          lines: [
            {
              catalogItemName: "Repair",
              offeringName: "Inspection",
              variantName: null,
              outcome: "INCLUDED",
              quantity: new Prisma.Decimal(1),
              totalMinor: 1000,
              unitPriceMinor: 1000,
              availabilityAttestationId: null,
              configurationVersionId: null as string | null,
              balanceRevision: null as number | null,
              offeringId: "service-offering",
            },
          ],
        },
      ],
    },
  }
}

/** Delegate guard: the real query may only use these reads; no global mocks. */
export function fixture(rows = [decision()], allowNativeWrites = false) {
  const state = {
    active: true,
    termsAccepted: true,
    assigned: true,
    role: "OPERATOR",
    storeActive: true,
    scoped: false,
    storeGranted: true,
    policyAllowed: true,
    product: false,
    sourceAvailable: true,
    sourceStatus: "SUBMITTED",
    policyRevision: 4,
    linkedConversations: [] as Array<{ conversationId: string }>,
  }
  const reads: Array<{ table: string; input: any }> = []
  const writes: string[] = []
  function delegate(
    table: string,
    handlers: Record<string, (input: any) => unknown>,
  ) {
    return new Proxy(handlers, {
      get(target, method: string) {
        if (method in target)
          return async (input: any) => {
            reads.push({ table, input })
            return target[method]!(input)
          }
        return async () => {
          writes.push(`${table}.${method}`)
          if (!allowNativeWrites)
            throw new Error(`Unexpected write: ${table}.${method}`)
          return { count: 1 }
        }
      },
    })
  }
  const client = {
    $transaction: () => {
      throw new Error("Nested transaction is forbidden")
    },
    legalAcceptance: delegate("legalAcceptance", {
      findUnique: ({where}) => {
        const publication = currentEffectiveLegalPublication()
        return state.termsAccepted && publication && where.userId_version.version === publication.version && [decisionScope.actorUserId,"maker-user"].includes(where.userId_version.userId)
          ? {documentHash: publication.documentHash} : null
      },
    }),
    membership: delegate("membership", {
      findFirst: ({ where }) =>
        state.active &&
        where.tenantId === decisionScope.tenantId &&
        (!where.userId || where.userId === decisionScope.actorUserId) &&
        (!where.id || where.id === "checker")
          ? {
              id: "checker",
              role: state.role,
              status: "ACTIVE",
              staffAccessMode: state.scoped ? "SCOPED" : "LEGACY",
              staffStoreAssignments: state.storeGranted
                ? [
                    {
                      storeId: decisionScope.storeId,
                      status: "ACTIVE",
                      role: "OPERATOR",
                    },
                  ]
                : [],
            }
          : null,
    }),
    store: delegate("store", {
      findFirst: ({ where }) =>
        state.storeActive &&
        where.id === decisionScope.storeId &&
        where.tenantId === decisionScope.tenantId
          ? { id: decisionScope.storeId, countryCode: "NG" }
          : null,
    }),
    serviceCommerceQuoteReleasePolicy: delegate("policy", {
      findFirst: ({ where }) =>
        where.storeId === decisionScope.storeId &&
        where.tenantId === decisionScope.tenantId
          ? {
              mode: "APPROVAL_REQUIRED",
              revision: state.policyRevision,
              selectedApproverMembershipIds: ["checker"],
            }
          : null,
    }),
    serviceCommerceStoreTeamAssignment: delegate("team", {
      findMany: () =>
        state.assigned
          ? [{ membershipId: "checker", capability: "QUOTE_APPROVER" }]
          : [],
    }),
    serviceCommercePolicyDecision: delegate("vertical-policy", {
      findMany: () =>
        state.policyAllowed ? allowedServiceCommercePolicyDecisionRows() : [],
    }),
    serviceCommercePolicyAuditEvent: delegate("policy-audit", {}),
    serviceCommerceQuoteApproval: delegate("approval", {
      updateMany: ({ where, data }) => {
        writes.push("approval.updateMany")
        if (!allowNativeWrites) throw new Error("Unexpected decision write")
        const row = rows.find(
          (row) =>
            row.id === where.id &&
            (!where.status || row.status === where.status) &&
            (!where.policyRevision ||
              row.policyRevision === where.policyRevision),
        )
        if (!row) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
      findFirst: ({ where }) =>
        rows.find(
          (row) =>
            row.id === where.id &&
            row.storeId === where.storeId &&
            row.tenantId === where.tenantId &&
            (!where.quoteId || row.quoteId === where.quoteId) &&
            (!where.quoteVersionId ||
              row.quoteVersionId === where.quoteVersionId) &&
            (!where.status || row.status === where.status),
        ) ?? null,
      findMany: ({ where, take }) =>
        rows
          .filter(
            (row) =>
              row.storeId === where.storeId &&
              row.tenantId === where.tenantId &&
              row.status === where.status &&
              (!where.OR ||
                row.requestedAt > where.OR[0].requestedAt.gt ||
                (row.requestedAt.getTime() ===
                  where.OR[1].requestedAt.getTime() &&
                  row.id > where.OR[1].id.gt)),
          )
          .sort(
            (a, b) =>
              a.requestedAt.getTime() - b.requestedAt.getTime() ||
              a.id.localeCompare(b.id),
          )
          .slice(0, take),
    }),
    serviceRequest: delegate("service-source", {
      findFirst: ({ where }) =>
        state.sourceAvailable &&
        rows.some(
          (row) =>
            row.sourceId === where.id &&
            row.storeId === where.storeId &&
            row.tenantId === where.tenantId,
        )
          ? { status: state.sourceStatus }
          : null,
    }),
    sellableOffering: delegate("offering", {
      findFirst: () => {
        const unit = {
          id: "unit-1",
          stockBehavior: "CANONICAL_SHARED",
          factor: new Prisma.Decimal(1),
          transactionScale: 0,
        }
        return {
          kind: state.product ? "PRODUCT_UNIT" : "SERVICE",
          status: "ACTIVE",
          variantId: "variant-1",
          storeAvailability: [{ isAvailable: true }],
          productUnitOffering: state.product
            ? {
                inventoryUnit: {
                  ...unit,
                  configurationVersion: {
                    id: "config-1",
                    status: "CURRENT",
                    units: [unit],
                    product: {
                      id: "product-1",
                      currentUnitConfigurationVersionId: "config-1",
                    },
                  },
                },
              }
            : null,
        }
      },
    }),
    stockBalanceSource: delegate("stock-balance", {
      findUnique: () => ({
        id: "balance-1",
        tenantId: decisionScope.tenantId,
        inventoryUnitId: "unit-1",
        onHandQuantity: new Prisma.Decimal(10),
        reservedQuantity: new Prisma.Decimal(0),
        revision: 2,
      }),
    }),
    commerceQuoteVersion: delegate("version", {
      findFirst: ({ where }) =>
        rows.find(
          (row) =>
            row.quoteVersionId === where.id &&
            (!where.quoteId || row.quoteId === where.quoteId) &&
            (!where.status || row.quoteVersion.status === where.status) &&
            (!where.quote?.currentVersionId ||
              row.quote.currentVersionId === where.quote.currentVersionId),
        )?.quoteVersion ?? null,
      updateMany: ({ where, data }) => {
        writes.push("version.updateMany")
        if (!allowNativeWrites) throw new Error("Unexpected version write")
        const row = rows.find(
          (row) =>
            row.quoteVersionId === where.id &&
            row.quoteVersion.status === where.status,
        )
        if (!row) return { count: 0 }
        Object.assign(row.quoteVersion, data)
        return { count: 1 }
      },
    }),
    commerceInquiry: delegate("inquiry", {
      findFirst: () => ({ vertical: "PHARMACY", status: "READY_TO_QUOTE" }),
    }),
    commerceQuoteReplayAccessToken: delegate("replay-token", {}),
    storeConversationRequestLink: delegate("links", {
      findMany: ({ take }) => state.linkedConversations.slice(0, take),
    }),
    serviceCommerceQuoteApprovalAuditEvent: delegate("approval-audit", {}),
  }
  return {
    state,
    reads,
    writes,
    tx: client as unknown as Prisma.TransactionClient,
    root: {
      $transaction: async (fn: (tx: Prisma.TransactionClient) => unknown) =>
        fn(client as unknown as Prisma.TransactionClient),
    } as unknown as PrismaClient,
  }
}
