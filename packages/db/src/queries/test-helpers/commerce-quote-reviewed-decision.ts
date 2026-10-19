import { decision, decisionScope, fixture } from "./commerce-quote-decision"
import {
  field,
  matches,
  project,
  reviewedIssueFixture,
} from "./commerce-quote-reviewed-issue"

/** Actual canonical decisions and linked release; only persistence is synthetic.
 * This fixture does not establish SQL locks, rollback, isolation or provider delivery.
 */
export function reviewedDecisionFixture(
  optionCount = 1,
  lineCount = 1,
  sourceKind: "service" | "commerce_inquiry" = "service",
) {
  const original = decision()
  const inquiry = sourceKind === "commerce_inquiry"
  if (inquiry) original.sourceType = "COMMERCE_INQUIRY"
  const option = original.quoteVersion.options[0]
  const line = option?.lines[0]
  if (!option || !line)
    throw Error("The actual decision fixture needs one line")
  const quote = {
    ...original.quote,
    id: original.quoteId,
    tenantId: original.tenantId,
    storeId: original.storeId,
    sourceId: original.sourceId,
    sourceType: original.sourceType,
  }
  const row = {
    ...original,
    quote,
    quoteVersion: {
      ...original.quoteVersion,
      clientVersionId: "private-native-version-identity",
      availabilityOutcome: inquiry ? "UNAVAILABLE" : "FULL",
      fulfilmentType: "PICKUP",
      subtotalMinor: inquiry ? 0 : lineCount * 1000,
      totalMinor: inquiry ? 0 : lineCount * 1000,
      discountMinor: 0,
      taxMinor: 0,
      fulfilmentFeeMinor: 0,
      customerNote: "Original version note",
      fulfilmentPromise: "Original version promise",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      options: Array.from({ length: optionCount }, (_, oi) => ({
        ...option,
        id: `saved-option-${oi}`,
        quoteVersionId: original.quoteVersionId,
        position: oi,
        label: `  Exact option ${oi}  `,
        customerNote: `Saved option note ${oi}`,
        fulfilmentPromise: `Saved fulfilment promise ${oi}`,
        currencyCode: "NGN",
        fulfilmentType: "PICKUP",
        availabilityOutcome: inquiry ? "UNAVAILABLE" : "FULL",
        subtotalMinor: inquiry ? 0 : lineCount * 1000,
        totalMinor: inquiry ? 0 : lineCount * 1000,
        lines: Array.from({ length: lineCount }, (_, li) => ({
          ...line,
          id: `saved-line-${oi}-${li}`,
          quoteVersionId: original.quoteVersionId,
          quoteOptionId: `saved-option-${oi}`,
          customerNote: `Saved line note ${oi}/${li}`,
          sourceLineId: inquiry ? `inquiry-line-${li}` : undefined,
          offeringId: inquiry ? "product-unavailable" : line.offeringId,
          outcome: inquiry ? "UNAVAILABLE" : "INCLUDED",
          unitPriceMinor: inquiry ? 0 : line.unitPriceMinor,
          totalMinor: inquiry ? 0 : line.totalMinor,
        })),
      })),
    },
  }
  const base = fixture([row], true)
  const transport = reviewedIssueFixture()
  const source = {
    id: row.sourceId,
    tenantId: row.tenantId,
    storeId: row.storeId,
    status: inquiry ? "READY_TO_QUOTE" : "SUBMITTED",
    vertical: "SERVICE",
    revision: 3,
  }
  base.state.sourceStatus = source.status
  const calls: Array<{ table: string; method: string; input: unknown }> = []
  const control = { sourceCas: true, failAudit: false }
  let depth = 0
  const linkedTables = new Set([
    "$queryRaw",
    "storeConversation",
    "storeConversationMessage",
    "storeConversationActionMessage",
    "storeConversationAccountInvitation",
    "storeConversationNotificationIntent",
    "storeConversationNotificationAuditEvent",
  ])
  const baseMethods: Record<string, string[]> = {
    legalAcceptance: ["findUnique"],
    membership: ["findFirst"],
    store: ["findFirst"],
    serviceCommerceQuoteReleasePolicy: ["findFirst"],
    serviceCommerceStoreTeamAssignment: ["findMany"],
    serviceCommercePolicyDecision: ["findMany"],
    serviceCommercePolicyAuditEvent: ["createMany"],
    serviceCommerceQuoteApproval: ["findFirst", "updateMany"],
    sellableOffering: ["findFirst"],
    stockBalanceSource: ["findFirst"],
  }
  function version() {
    return { ...row.quoteVersion, quote: row.quote }
  }
  const tx = new Proxy(base.tx, {
    get(target, key, receiver) {
      if (typeof key === "string" && linkedTables.has(key))
        return Reflect.get(transport.tx, key)
      if (key === (inquiry ? "commerceInquiry" : "serviceRequest"))
        return {
          async findFirst(input: unknown) {
            calls.push({ table: String(key), method: "findFirst", input })
            if (!base.state.sourceAvailable) return null
            source.status = base.state.sourceStatus
            return matches(source, field(input, "where"))
              ? project(source, field(input, "select"))
              : null
          },
          async updateMany(input: unknown) {
            calls.push({ table: String(key), method: "updateMany", input })
            if (!control.sourceCas || !matches(source, field(input, "where")))
              return { count: 0 }
            const status = field(field(input, "data"), "status")
            const increment = field(
              field(field(input, "data"), "revision"),
              "increment",
            )
            if (typeof status !== "string" || increment !== 1)
              throw Error("Unexpected canonical source mutation")
            source.status = status
            base.state.sourceStatus = status
            source.revision++
            return { count: 1 }
          },
        }
      if (inquiry && key === "commerceInquiryLine")
        return {
          async count(input: unknown) {
            calls.push({ table: "commerceInquiryLine", method: "count", input })
            const rows = Array.from({ length: lineCount }, (_, i) => ({
              id: `inquiry-line-${i}`,
              inquiryId: row.sourceId,
              tenantId: row.tenantId,
              storeId: row.storeId,
            }))
            return rows.filter((line) => matches(line, field(input, "where")))
              .length
          },
        }
      if (inquiry && key === "commerceInquiryAuditEvent")
        return {
          async create(input: unknown) {
            calls.push({
              table: "commerceInquiryAuditEvent",
              method: "create",
              input,
            })
            if (
              !matches(field(input, "data"), {
                actorUserId: decisionScope.actorUserId,
                inquiryId: row.sourceId,
                tenantId: row.tenantId,
                storeId: row.storeId,
                fromStatus: "READY_TO_QUOTE",
                toStatus: "QUOTED",
                type: "QUOTE_ISSUED",
              })
            )
              throw Error("Unexpected Inquiry issue audit")
            return { id: "inquiry-issue-audit" }
          },
        }
      if (key === "commerceQuoteVersion")
        return {
          async findFirst(input: unknown) {
            calls.push({
              table: "commerceQuoteVersion",
              method: "findFirst",
              input,
            })
            const current = version()
            return matches(current, field(input, "where"))
              ? project(current, field(input, "select"))
              : null
          },
          async updateMany(
            input: Parameters<
              typeof base.tx.commerceQuoteVersion.updateMany
            >[0],
          ) {
            if (!matches(version(), input.where)) return { count: 0 }
            return base.tx.commerceQuoteVersion.updateMany(input)
          },
        }
      if (key === "storeConversationRequestLink")
        return {
          async findMany(input: unknown) {
            calls.push({
              table: "storeConversationRequestLink",
              method: "findMany",
              input,
            })
            const where = field(input, "where")
            const expected = {
              tenantId: row.tenantId,
              storeId: row.storeId,
              sourceId: row.sourceId,
              kind: inquiry ? "COMMERCE_INQUIRY" : "SERVICE_REQUEST",
            }
            if (!matches(expected, where)) return []
            const take = field(input, "take")
            if (typeof take !== "number" || take !== 101)
              throw Error("Complete linked release must request 101 rows")
            return base.state.linkedConversations.slice(0, take)
          },
          create: Reflect.get(transport.tx, "storeConversationRequestLink")
            .create,
        }
      if (key === "serviceCommerceQuoteApprovalAuditEvent")
        return {
          async create(
            input: Parameters<
              typeof base.tx.serviceCommerceQuoteApprovalAuditEvent.create
            >[0],
          ) {
            if (control.failAudit)
              throw Error(
                "Synthetic late audit failure; owning transaction must roll back",
              )
            return base.tx.serviceCommerceQuoteApprovalAuditEvent.create(input)
          },
        }
      if (typeof key === "string" && baseMethods[key])
        return new Proxy(Reflect.get(target, key, receiver), {
          get(delegate, method) {
            if (
              typeof method !== "string" ||
              !baseMethods[key]?.includes(method)
            )
              throw Error(
                `Unexpected persistence method: ${key}.${String(method)}`,
              )
            return Reflect.get(delegate, method)
          },
        })
      throw Error(`Unexpected persistence table: ${String(key)}`)
    },
  })
  function links(count: number) {
    const values = Array.from({ length: count }, (_, i) => ({
      conversationId: `linked-chat-${i}`,
    }))
    base.state.linkedConversations = values
    transport.state.links = values
    transport.state.allowWrites = true
  }
  async function inTx<T>(run: () => Promise<T>) {
    if (depth !== 0) throw Error("Fixture forbids nested transactions")
    depth++
    try {
      return await run()
    } finally {
      depth--
    }
  }
  return {
    ...base,
    tx,
    row,
    source,
    calls,
    control,
    transport,
    links,
    inTx,
    depth: () => depth,
    input: {
      ...decisionScope,
      approvalId: row.id,
      quoteId: row.quoteId,
      quoteVersionId: row.quoteVersionId,
      reason: "  Exact reviewed release reason  ",
    },
  }
}
