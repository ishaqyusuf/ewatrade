import { expect, test } from "bun:test"
import { quoteIssueIntent } from "@ewatrade/assistant/general/quote-issue-intent"
import { generalQuoteIssueNativeInput } from "./general-quote-issue-intent"

const scope = { actorUserId: "actor", tenantId: "tenant", storeId: "store" }
const command = { clientOperationId: "assistant_server_proposal_key" }
function intent() {
  return {
    source: { kind: "service_request", id: "request" },
    operation: { kind: "issue" },
    options: [
      {
        label: " Standard ",
        availabilityOutcome: "full",
        lines: [
          {
            sourceLineId: "line",
            offeringId: "offering",
            outcome: "included",
            quantity: "1.25",
            unitPriceMinor: 100,
          },
        ],
      },
    ],
  }
}

test("strict editable intent rejects authority, proof, catalog snapshot and native command identities at every level", () => {
  for (const key of [
    "actorUserId",
    "tenantId",
    "storeId",
    "clientQuoteId",
    "clientVersionId",
    "authorize",
    "protectActionId",
    "screenedTexts",
    "approvalToken",
    "token",
  ])
    expect(
      quoteIssueIntent.safeParse({ ...intent(), [key]: "untrusted" }).success,
    ).toBe(false)
  for (const key of [
    "clientOptionId",
    "subtotalMinor",
    "totalMinor",
    "currencyCode",
  ])
    expect(
      quoteIssueIntent.safeParse({
        ...intent(),
        options: [{ ...intent().options[0], [key]: "untrusted" }],
      }).success,
    ).toBe(false)
  for (const key of [
    "catalogSourceVerified",
    "configurationVersionId",
    "balanceRevision",
    "availabilityAttestationType",
    "catalogSuggestedUnitPriceMinor",
    "offeringName",
    "optionSelections",
    "token",
  ])
    expect(
      quoteIssueIntent.safeParse({
        ...intent(),
        options: [
          {
            ...intent().options[0],
            lines: [{ ...intent().options[0]?.lines[0], [key]: "untrusted" }],
          },
        ],
      }).success,
    ).toBe(false)
  expect(
    quoteIssueIntent.safeParse({
      ...intent(),
      source: { kind: "prescription_request", id: "private" },
    }).success,
  ).toBe(false)
  expect(
    quoteIssueIntent.safeParse({
      ...intent(),
      operation: { kind: "issue", quoteId: "invented" },
    }).success,
  ).toBe(false)
})

test("server key deterministically owns all native identities while business edits retain that operation", () => {
  const first = generalQuoteIssueNativeInput(intent(), scope, command)
  const again = generalQuoteIssueNativeInput(intent(), scope, command)
  expect(again).toEqual(first)
  expect(first.options?.[0]?.label).toBe("Standard")
  const edited = intent()
  const line = edited.options[0]?.lines[0]
  if (!line) throw Error("Expected priced line")
  line.unitPriceMinor = 200
  const changed = generalQuoteIssueNativeInput(edited, scope, command)
  expect(changed.clientQuoteId).toBe(first.clientQuoteId)
  expect(changed.clientVersionId).toBe(first.clientVersionId)
  expect(changed.options?.[0]?.clientOptionId).toBe(
    first.options?.[0]?.clientOptionId,
  )
  expect(changed.options?.[0]?.lines[0]?.unitPriceMinor).toBe(200)
  for (const nextScope of [
    { ...scope, actorUserId: "other" },
    { ...scope, tenantId: "other" },
    { ...scope, storeId: "other" },
  ])
    expect(
      generalQuoteIssueNativeInput(intent(), nextScope, command)
        .clientVersionId,
    ).not.toBe(first.clientVersionId)
  expect(
    generalQuoteIssueNativeInput(intent(), scope, {
      clientOperationId: "other-key",
    }).clientVersionId,
  ).not.toBe(first.clientVersionId)
  expect(
    generalQuoteIssueNativeInput(
      { ...intent(), source: { kind: "service_request", id: "other" } },
      scope,
      command,
    ).clientVersionId,
  ).not.toBe(first.clientVersionId)
  expect(JSON.stringify(first)).not.toContain(command.clientOperationId)
})

test("revision uses the stored Quote command alias and the selected exact original version", () => {
  const edit = {
    ...intent(),
    operation: {
      kind: "revise" as const,
      quoteId: "quote",
      quoteVersionId: "original-version",
    },
  }
  expect(() => generalQuoteIssueNativeInput(edit, scope, command)).toThrow()
  const result = generalQuoteIssueNativeInput(edit, scope, {
    ...command,
    existingClientQuoteId: "stored-native-quote-command",
  })
  expect(result.clientQuoteId).toBe("stored-native-quote-command")
  expect(result.operation).toEqual(edit.operation)
  expect(
    quoteIssueIntent.safeParse({
      ...edit,
      existingClientQuoteId: "client-alias",
    }).success,
  ).toBe(false)
})

test("native20by100 lines and all independent option adjustments are retained without truncation", () => {
  const options = Array.from({ length: 20 }, (_, index) => ({
    label: `Option ${index}`,
    availabilityOutcome: "full",
    customerNote: "N".repeat(500),
    fulfilmentPromise: "P".repeat(500),
    fulfilmentType: "delivery",
    discountMinor: 1,
    taxMinor: 2,
    fulfilmentFeeMinor: 3,
    lines: Array.from({ length: 100 }, (_, row) => ({
      sourceLineId: `line-${row}`,
      offeringId: `offering-${row}`,
      outcome: "included",
      quantity: "999999999999.999999",
      unitPriceMinor: 100_000_000,
      customerNote: "L".repeat(500),
    })),
  }))
  const result = generalQuoteIssueNativeInput(
    { ...intent(), options },
    scope,
    command,
  )
  expect(result.options).toHaveLength(20)
  expect(result.options?.map((option) => option.lines.length)).toEqual(
    Array(20).fill(100),
  )
  expect(
    new Set(result.options?.map((option) => option.clientOptionId)).size,
  ).toBe(20)
  expect(result.options?.[19]).toMatchObject({
    discountMinor: 1,
    taxMinor: 2,
    fulfilmentFeeMinor: 3,
    fulfilmentType: "delivery",
    customerNote: "N".repeat(500),
  })
  expect(result.options?.[19]?.lines[99]).toMatchObject({
    quantity: "999999999999.999999",
    unitPriceMinor: 100_000_000,
    customerNote: "L".repeat(500),
  })
  expect(
    quoteIssueIntent.safeParse({
      ...intent(),
      options: [...options, options[0]],
    }).success,
  ).toBe(false)
  expect(
    quoteIssueIntent.safeParse({
      ...intent(),
      options: [
        {
          ...options[0],
          lines: [...(options[0]?.lines ?? []), options[0]?.lines[0]],
        },
      ],
    }).success,
  ).toBe(false)
})

test("source-specific line references, zero price, exact quantity and native storage bounds refuse malformed intent", () => {
  const base = intent()
  for (const quantity of [
    "0",
    "-1",
    "1e2",
    "1.0000001",
    "100000000000000000000000000000000",
    "0.000000",
  ])
    expect(
      quoteIssueIntent.safeParse({
        ...base,
        options: [
          {
            ...base.options[0],
            lines: [{ ...base.options[0]?.lines[0], quantity }],
          },
        ],
      }).success,
    ).toBe(false)
  for (const unitPriceMinor of [-1, 1.5, 100_000_001, Number.MAX_SAFE_INTEGER])
    expect(
      quoteIssueIntent.safeParse({
        ...base,
        options: [
          {
            ...base.options[0],
            lines: [{ ...base.options[0]?.lines[0], unitPriceMinor }],
          },
        ],
      }).success,
    ).toBe(false)
  expect(
    quoteIssueIntent.safeParse({
      ...base,
      options: [
        {
          ...base.options[0],
          lines: [
            {
              offeringId: "offering",
              outcome: "included",
              quantity: "1",
              unitPriceMinor: 0,
            },
          ],
        },
      ],
    }).success,
  ).toBe(true)
  const unavailable = {
    label: "Unavailable",
    availabilityOutcome: "unavailable",
    lines: [{ outcome: "unavailable" }],
  }
  expect(
    quoteIssueIntent.safeParse({ ...base, options: [unavailable] }).success,
  ).toBe(true)
  expect(
    quoteIssueIntent.safeParse({
      ...base,
      source: { kind: "commerce_inquiry", id: "inquiry" },
      options: [unavailable],
    }).success,
  ).toBe(false)
  const attested = {
    ...unavailable,
    lines: [
      {
        outcome: "unavailable",
        sourceLineId: "line",
        availabilityAttestationId: "attestation",
      },
    ],
  }
  expect(
    quoteIssueIntent.safeParse({ ...base, options: [attested] }).success,
  ).toBe(false)
  expect(
    quoteIssueIntent.safeParse({
      ...base,
      source: { kind: "commerce_inquiry", id: "inquiry" },
      options: [attested],
    }).success,
  ).toBe(true)
  expect(
    quoteIssueIntent.safeParse({
      ...base,
      options: [{ ...base.options[0], taxMinor: 2_147_483_648 }],
    }).success,
  ).toBe(false)
})

test("expiry retains the exact supported UTC instant and refuses lost submillisecond precision", () => {
  for (const expiresAt of [
    "2027-01-01T12:00:00Z",
    "2027-01-01T12:00:00.1Z",
    "2027-01-01T13:00:00.123+01:00",
  ])
    expect(
      generalQuoteIssueNativeInput(
        { ...intent(), expiresAt },
        scope,
        command,
      ).expiresAt?.getTime(),
    ).toBe(new Date(expiresAt).getTime())
  expect(
    quoteIssueIntent.safeParse({
      ...intent(),
      expiresAt: "2027-01-01T12:00:00.123456Z",
    }).success,
  ).toBe(false)
  expect(
    quoteIssueIntent.safeParse({ ...intent(), expiresAt: "not-a-date" })
      .success,
  ).toBe(false)
})

test("native exact32integerdigit quantities and redundant trailing zeros remain supported", () => {
  for (const quantity of [
    "1000000000000",
    "99999999999999999999999999999999.999999",
    "1.0000000",
    "0001.2500000",
  ]) {
    const raw = {
      ...intent(),
      options: [
        {
          label: "Zero price",
          availabilityOutcome: "full",
          lines: [
            {
              offeringId: "offering",
              sourceLineId: "line",
              outcome: "included",
              quantity,
              unitPriceMinor: 0,
            },
          ],
        },
      ],
    }
    const parsed = quoteIssueIntent.parse(raw)
    const native = generalQuoteIssueNativeInput(raw, scope, command)
    expect(native.options?.[0]?.lines[0]?.quantity).toBe(
      parsed.options[0]?.lines[0]?.quantity,
    )
    expect(native.options?.[0]?.lines[0]?.unitPriceMinor).toBe(0)
  }
  expect(
    String(
      quoteIssueIntent.parse({
        ...intent(),
        options: [
          {
            label: "Normalized",
            availabilityOutcome: "full",
            lines: [
              {
                offeringId: "offering",
                outcome: "included",
                quantity: "0001.2500000",
                unitPriceMinor: 0,
              },
            ],
          },
        ],
      }).options[0]?.lines[0]?.quantity,
    ),
  ).toBe("1.25")
})
