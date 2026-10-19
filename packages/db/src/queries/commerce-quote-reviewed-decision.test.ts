import { afterAll, expect, spyOn, test } from "bun:test"
import * as textSafety from "@ewatrade/service-commerce/server"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import {
  approveReviewedCommerceQuoteInTransaction,
  inspectReviewedCommerceQuoteApprovalInTransaction,
  prepareReviewedCommerceQuoteApproval,
} from "./commerce-quote-reviewed-decision"
import {
  approvePreparedCommerceQuoteVersionInTransaction,
  prepareCommerceQuoteApproval,
} from "./commerce-quotes"
import { reviewedDecisionFixture } from "./test-helpers/commerce-quote-reviewed-decision"

// Actual review, Terms, native approval and linked release. No module mocks.
// Synthetic persistence does not prove PostgreSQL rollback, locks or isolation.
function noNetwork(): never {
  throw Error("Source fixture forbids network")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(noNetwork, { preconnect: noNetwork }),
)
afterAll(() => network.mockRestore())
type Fixture = ReturnType<typeof reviewedDecisionFixture>
const decisionId = "one-server-decision-identity"
const scope = {
  actorUserId: "checker-user",
  tenantId: "tenant-1",
  storeId: "store-1",
}
function publication() {
  const value = currentEffectiveLegalPublication()
  if (!value) throw Error("Actual fixture requires the current published Terms")
  return value
}
async function configured<T>(
  run: (local: () => void, production: () => void) => Promise<T>,
) {
  const keys = [
    "APP_ENV",
    "DEV_PROFILE",
    "STORE_CONVERSATION_TEXT_SAFETY_PROVIDER",
  ] as const
  const previous = keys.map((key) => [key, process.env[key]] as const)
  const local = () => {
    process.env.APP_ENV = "local"
    process.env.DEV_PROFILE = "local"
    process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = "qa-fixture"
  }
  const production = () => {
    process.env.APP_ENV = "production"
    process.env.DEV_PROFILE = "production"
  }
  try {
    local()
    return await run(local, production)
  } finally {
    for (const [key, value] of previous)
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
  }
}
function inspect(f: Fixture, clientDecisionId = decisionId) {
  return f.inTx(() =>
    inspectReviewedCommerceQuoteApprovalInTransaction(
      f.tx,
      f.input,
      clientDecisionId,
      publication(),
    ),
  )
}
async function prepared(f: Fixture) {
  const { plan, target } = await inspect(f)
  return {
    target,
    plan,
    proof: await prepareReviewedCommerceQuoteApproval(plan),
  }
}
function approve(
  f: Fixture,
  proof: unknown,
  currentScope = scope,
  legal = publication(),
): Promise<
  Awaited<ReturnType<typeof approveReviewedCommerceQuoteInTransaction>>
> {
  return f.inTx(() =>
    Reflect.apply(approveReviewedCommerceQuoteInTransaction, undefined, [
      f.tx,
      currentScope,
      proof,
      legal,
    ]),
  )
}
function noBusinessWrites(f: Fixture) {
  expect(f.writes).toEqual([])
  expect(f.transport.writes).toEqual([])
  expect(f.calls.filter((call) => call.method === "updateMany")).toEqual([])
}

test("actual pending inspect / outside screen / fresh native approval emits exact safe receipt and linked effects with provider unavailable inside TX", async () => {
  await configured(async (local, production) => {
    const f = reviewedDecisionFixture()
    f.links(1)
    const factory = textSafety.getConfiguredStoreConversationTextSafetyProvider
    const depths: number[] = []
    const texts: string[] = []
    const screening = spyOn(
      textSafety,
      "getConfiguredStoreConversationTextSafetyProvider",
    ).mockImplementation((environment) => {
      depths.push(f.depth())
      if (f.depth() !== 0) throw Error("Provider access inside TX")
      const actual = factory(environment)
      return actual
        ? {
            async inspect(input) {
              texts.push(input.text)
              return actual.inspect(input)
            },
          }
        : null
    })
    try {
      production()
      const { plan, target } = await inspect(f)
      noBusinessWrites(f)
      expect(depths).toEqual([])
      const reads = f.reads.length + f.calls.length + f.transport.reads.length
      local()
      const proof = await prepareReviewedCommerceQuoteApproval(plan)
      expect(f.reads.length + f.calls.length + f.transport.reads.length).toBe(
        reads,
      )
      expect(Object.isFrozen(plan)).toBe(true)
      expect(Object.isFrozen(proof)).toBe(true)
      expect(JSON.stringify({ plan, proof })).toBe('{"plan":{},"proof":{}}')
      expect(target).toEqual({
        id: f.row.id,
        revision: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(texts).toEqual([
        "Original version note",
        "Original version promise",
        "  Exact option 0  ",
        "Saved option note 0",
        "Saved fulfilment promise 0",
        "Saved line note 0/0",
        "Exact option 0",
      ])
      production()
      const receipt = await approve(f, proof)
      expect(receipt).toEqual({
        approvalId: f.row.id,
        quoteId: f.row.quoteId,
        quoteVersionId: f.row.quoteVersionId,
        decision: "approved",
        policyRevision: 4,
        decidedAt: expect.any(String),
        decidedByMembershipId: "checker",
        reason: "Exact reviewed release reason",
        releaseState: "released",
      })
      expect(f.source).toMatchObject({ status: "QUOTED", revision: 4 })
      expect(f.row.quoteVersion.status).toBe("ISSUED")
      expect(f.row.decisionClientId).toBe(decisionId)
      expect(f.transport.messages.map((row) => row.kind)).toEqual([
        "ACTION_MESSAGE",
        "ACCOUNT_INVITATION",
      ])
      expect(f.transport.presentations).toHaveLength(1)
      expect(f.transport.invitations).toHaveLength(1)
      expect(f.transport.notifications).toHaveLength(1)
      expect(f.transport.denied).toEqual([])
      expect(depths.every((depth) => depth === 0)).toBe(true)
      expect(depths).toHaveLength(7)
      for (const key of [
        "token",
        "Token",
        "payloadHash",
        "clientVersionId",
        "screenedTexts",
        "proof",
      ])
        expect(JSON.stringify(receipt)).not.toContain(key)
      expect(network).not.toHaveBeenCalled()
      const writes = [...f.writes]
      // This is a pending-only helper. Terminal recovery belongs to its caller.
      await expect(approve(f, proof)).rejects.toThrow()
      expect(f.writes).toEqual(writes)
    } finally {
      screening.mockRestore()
    }
  })
})

test("full native20×100 options and100 linked chats all pass the actual screened approval chain", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture(20, 100)
    f.links(100)
    const { proof } = await prepared(f)
    production()
    expect((await approve(f, proof)).decision).toBe("approved")
    expect(f.row.quoteVersion.options).toHaveLength(20)
    for (const option of f.row.quoteVersion.options)
      expect(option.lines).toHaveLength(100)
    expect(f.transport.presentations).toHaveLength(100)
    expect(f.transport.invitations).toHaveLength(100)
    expect(f.transport.notifications).toHaveLength(100)
    expect(f.transport.messages).toHaveLength(200)
    expect(
      new Set(f.transport.presentations.map((row) => row.conversationId)).size,
    ).toBe(100)
    expect(f.source.revision).toBe(4)
    expect(f.transport.denied).toEqual([])
    expect(network).not.toHaveBeenCalled()
  })
})

test("missing, forged, cloned and other-kind proof refuses before any transaction access or provider fallback", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    const { plan, proof } = await prepared(f)
    production()
    const forbiddenTx = new Proxy(f.tx, {
      get() {
        throw Error("Forged proof must not access TX")
      },
    })
    for (const value of [
      undefined,
      null,
      {},
      true,
      JSON.parse(JSON.stringify(proof)),
      plan,
    ])
      await expect(
        Reflect.apply(approveReviewedCommerceQuoteInTransaction, undefined, [
          forbiddenTx,
          scope,
          value,
          publication(),
        ]),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
    for (const value of [null, {}, JSON.parse(JSON.stringify(plan)), proof])
      await expect(
        Reflect.apply(prepareReviewedCommerceQuoteApproval, undefined, [value]),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
    noBusinessWrites(f)
  })
})

test("native explicit invalid proof has no mandatory-screening fallback", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    const input = {
      ...f.input,
      clientDecisionId: decisionId,
      expectedPolicyRevision: 4,
    }
    const option = f.row.quoteVersion.options[0]
    if (!option) throw Error("Expected option")
    const other = await prepareCommerceQuoteApproval(
      { ...input, clientDecisionId: "other-decision" },
      { id: f.row.sourceId, kind: "service_request" },
      [option],
      publication(),
      f.row.quoteVersion,
    )
    production()
    for (const value of [
      undefined,
      null,
      {},
      JSON.parse(JSON.stringify(other)),
      other,
    ])
      await expect(
        Reflect.apply(
          approvePreparedCommerceQuoteVersionInTransaction,
          undefined,
          [f.tx, input, value, publication()],
        ),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
    noBusinessWrites(f)
  })
})

test("scope, Terms, selected role, policy, source, target and all saved text races refuse before business writes", async () => {
  await configured(async (local, production) => {
    const changes: Array<[string, (f: Fixture) => void]> = [
      [
        "membership",
        (f) => {
          f.state.active = false
        },
      ],
      [
        "role",
        (f) => {
          f.state.role = "MEMBER"
        },
      ],
      [
        "Store",
        (f) => {
          f.state.storeActive = false
        },
      ],
      [
        "Terms",
        (f) => {
          f.state.termsAccepted = false
        },
      ],
      [
        "approver",
        (f) => {
          f.state.assigned = false
        },
      ],
      [
        "release policy",
        (f) => {
          f.state.policyRevision++
        },
      ],
      [
        "vertical policy",
        (f) => {
          f.state.policyAllowed = false
        },
      ],
      [
        "source",
        (f) => {
          f.state.sourceAvailable = false
        },
      ],
      [
        "source lifecycle",
        (f) => {
          f.state.sourceStatus = "WITHDRAWN"
        },
      ],
      [
        "target",
        (f) => {
          f.row.quote.currentVersionId = "other-version"
        },
      ],
      [
        "saved version note",
        (f) => {
          f.row.quoteVersion.customerNote += " changed"
        },
      ],
      [
        "saved option label",
        (f) => {
          const o = f.row.quoteVersion.options[0]
          if (o) o.label += " changed"
        },
      ],
      [
        "saved option note",
        (f) => {
          const o = f.row.quoteVersion.options[0]
          if (o) o.customerNote += " changed"
        },
      ],
      [
        "saved promise",
        (f) => {
          const o = f.row.quoteVersion.options[0]
          if (o) o.fulfilmentPromise += " changed"
        },
      ],
      [
        "saved line note",
        (f) => {
          const l = f.row.quoteVersion.options[0]?.lines[0]
          if (l) l.customerNote += " changed"
        },
      ],
    ]
    for (const [name, change] of changes) {
      local()
      const f = reviewedDecisionFixture()
      const { proof } = await prepared(f)
      change(f)
      production()
      await expect(approve(f, proof), name).rejects.toThrow()
      noBusinessWrites(f)
    }
    for (const currentScope of [
      { ...scope, actorUserId: "other" },
      { ...scope, tenantId: "other" },
      { ...scope, storeId: "other" },
    ]) {
      local()
      const f = reviewedDecisionFixture()
      const { proof } = await prepared(f)
      production()
      await expect(approve(f, proof, currentScope)).rejects.toMatchObject({
        code: "QUOTE_CONFLICT",
      })
      noBusinessWrites(f)
    }
    local()
    const f = reviewedDecisionFixture()
    const { proof } = await prepared(f)
    production()
    await expect(
      approve(f, proof, scope, {
        ...publication(),
        documentHash: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
    noBusinessWrites(f)
  })
})

test("the original snapshot remains bound if caller-owned input and returned target mutate after inspection", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    const { plan, target } = await inspect(f)
    f.input.reason = "Caller changed reason"
    f.input.quoteVersionId = "foreign-version"
    target.id = "foreign-approval"
    target.revision = "b".repeat(64)
    const proof = await prepareReviewedCommerceQuoteApproval(plan)
    production()
    const receipt = await approve(f, proof)
    expect(receipt.quoteVersionId).toBe(f.row.quoteVersionId)
    expect(receipt.reason).toBe("Exact reviewed release reason")
    expect(f.row.decisionClientId).toBe(decisionId)
  })
})

test("failed or unavailable configured screening cannot produce prepared approval evidence", async () => {
  await configured(async (local, production) => {
    for (const marker of ["[[qa-reject]]", "[[qa-review]]"]) {
      local()
      const f = reviewedDecisionFixture()
      const option = f.row.quoteVersion.options[0]
      if (!option) throw Error("Expected option")
      option.label = marker
      const { plan } = await inspect(f)
      await expect(prepareReviewedCommerceQuoteApproval(plan)).rejects.toThrow()
      noBusinessWrites(f)
    }
    local()
    const f = reviewedDecisionFixture()
    const { plan } = await inspect(f)
    production()
    await expect(prepareReviewedCommerceQuoteApproval(plan)).rejects.toThrow()
    noBusinessWrites(f)
    expect(network).not.toHaveBeenCalled()
  })
})

test("pre-write refusal leaves the same prepared identity retryable without re-screening", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    const { proof } = await prepared(f)
    production()
    f.row.quoteVersion.customerNote += " changed"
    await expect(approve(f, proof)).rejects.toThrow()
    noBusinessWrites(f)
    f.row.quoteVersion.customerNote = "Original version note"
    expect((await approve(f, proof)).decision).toBe("approved")
    expect(f.row.decisionClientId).toBe(decisionId)
  })
})

test("late synthetic failure is honestly uncertain; explicitly restored rollback state can reuse original proof", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    const initialApproval = {
      status: f.row.status,
      decidedAt: f.row.decidedAt,
      decidedByMembershipId: f.row.decidedByMembershipId,
      decisionClientId: f.row.decisionClientId,
      decisionPayloadHash: f.row.decisionPayloadHash,
      reason: f.row.reason,
    }
    const initialVersion = {
      status: f.row.quoteVersion.status,
      issuedAt: f.row.quoteVersion.issuedAt,
      acceptanceTokenDigest: f.row.quoteVersion.acceptanceTokenDigest,
    }
    const { proof } = await prepared(f)
    production()
    f.control.failAudit = true
    await expect(approve(f, proof)).rejects.toThrow(
      "Synthetic late audit failure",
    )
    expect(f.row.status).toBe("APPROVED")
    expect(f.row.quoteVersion.status).toBe("ISSUED")
    expect(f.source.revision).toBe(4)
    // These delegates have no rollback. Restore only explicit changed rows to
    // simulate the caller-owned SQL rollback; do not claim this proves it.
    Object.assign(f.row, initialApproval)
    Object.assign(f.row.quoteVersion, initialVersion)
    f.source.status = "SUBMITTED"
    f.source.revision = 3
    f.state.sourceStatus = "SUBMITTED"
    f.control.failAudit = false
    expect((await approve(f, proof)).decision).toBe("approved")
    expect(f.row.decisionClientId).toBe(decisionId)
    expect(f.source.revision).toBe(4)
  })
})

test("simultaneous and later preparation of one inspected plan screens once and returns one opaque native identity", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    const { plan } = await inspect(f)
    const factory = textSafety.getConfiguredStoreConversationTextSafetyProvider
    const texts: string[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const screening = spyOn(
      textSafety,
      "getConfiguredStoreConversationTextSafetyProvider",
    ).mockImplementation((environment) => {
      expect(f.depth()).toBe(0)
      const actual = factory(environment)
      return actual
        ? {
            async inspect(input) {
              texts.push(input.text)
              await gate
              return actual.inspect(input)
            },
          }
        : null
    })
    try {
      const first = prepareReviewedCommerceQuoteApproval(plan)
      const second = prepareReviewedCommerceQuoteApproval(plan)
      expect(texts).toEqual(["Original version note"])
      release()
      const [a, b] = await Promise.all([first, second])
      expect(a).toBe(b)
      expect(await prepareReviewedCommerceQuoteApproval(plan)).toBe(a)
      expect(texts).toHaveLength(7)
      noBusinessWrites(f)
      production()
      expect((await approve(f, a)).decision).toBe("approved")
      expect(f.row.decisionClientId).toBe(decisionId)
    } finally {
      release()
      screening.mockRestore()
    }
  })
})

test("expired, terminal, foreign original and over100 linked requests cannot even create a pending plan", async () => {
  await configured(async () => {
    const cases: Array<(f: Fixture) => void> = [
      (f) => {
        f.row.quoteVersion.expiresAt = new Date("2000-01-01T00:00:00Z")
      },
      (f) => {
        f.row.status = "APPROVED"
      },
      (f) => {
        f.row.status = "REJECTED"
      },
      (f) => {
        f.row.status = "SUPERSEDED"
      },
      (f) => {
        f.input.approvalId = "foreign-approval"
      },
      (f) => {
        f.input.quoteId = "foreign-quote"
      },
      (f) => {
        f.input.quoteVersionId = "foreign-version"
      },
      (f) => {
        f.links(101)
      },
    ]
    for (const change of cases) {
      const f = reviewedDecisionFixture()
      change(f)
      await expect(inspect(f)).rejects.toThrow()
      noBusinessWrites(f)
    }
  })
})

test("expiry and complete linked-set drift after preparation refuse without native effects", async () => {
  await configured(async (local, production) => {
    for (const change of [
      (f: Fixture) => {
        f.row.quoteVersion.expiresAt = new Date("2000-01-01T00:00:00Z")
      },
      (f: Fixture) => {
        f.links(1)
      },
      (f: Fixture) => {
        f.links(101)
      },
    ]) {
      local()
      const f = reviewedDecisionFixture()
      const { proof } = await prepared(f)
      change(f)
      production()
      await expect(approve(f, proof)).rejects.toThrow()
      noBusinessWrites(f)
    }
  })
})

test("native proof independently binds exact source and saved text rather than falling back to inside-TX screening", async () => {
  await configured(async (local, production) => {
    for (const variant of ["text", "source"] as const) {
      local()
      const f = reviewedDecisionFixture()
      const option = f.row.quoteVersion.options[0]
      if (!option) throw Error("Expected option")
      const input = {
        ...f.input,
        clientDecisionId: decisionId,
        expectedPolicyRevision: 4,
      }
      const proof = await prepareCommerceQuoteApproval(
        input,
        {
          id: variant === "source" ? "foreign-source" : f.row.sourceId,
          kind: "service_request",
        },
        [option],
        publication(),
        f.row.quoteVersion,
      )
      if (variant === "text") option.label += " changed after native prepare"
      production()
      await expect(
        f.inTx(() =>
          approvePreparedCommerceQuoteVersionInTransaction(
            f.tx,
            input,
            proof,
            publication(),
          ),
        ),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
      noBusinessWrites(f)
    }
  })
})

test("actual nonclinical Inquiry zero/unavailable approval preserves owned lines and records its source audit and linked effects", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture(1, 1, "commerce_inquiry")
    f.links(1)
    const { proof } = await prepared(f)
    production()
    expect((await approve(f, proof)).decision).toBe("approved")
    expect(f.source).toMatchObject({
      status: "QUOTED",
      revision: 4,
      vertical: "SERVICE",
    })
    expect(
      f.calls.filter((row) => row.table === "commerceInquiryLine").length,
    ).toBeGreaterThan(0)
    expect(
      f.calls.filter((row) => row.table === "commerceInquiryAuditEvent"),
    ).toHaveLength(1)
    expect(f.transport.presentations).toHaveLength(1)
    expect(f.transport.presentations[0]?.sourceKind).toBe("COMMERCE_INQUIRY")
    expect(f.transport.messages).toHaveLength(2)
    expect(f.transport.denied).toEqual([])
  })
})

test("last saved note in full20×100 remains mandatory screening content", async () => {
  await configured(async () => {
    const f = reviewedDecisionFixture(20, 100)
    const last = f.row.quoteVersion.options[19]?.lines[99]
    if (!last) throw Error("Full last option/line required")
    last.customerNote = "Final note [[qa-reject]]"
    const { plan } = await inspect(f)
    await expect(prepareReviewedCommerceQuoteApproval(plan)).rejects.toThrow()
    noBusinessWrites(f)
  })
})

test("legacy version-level note and promise each require outside-transaction screening", async () => {
  await configured(async (local) => {
    for (const field of ["customerNote", "fulfilmentPromise"] as const) {
      local()
      const f = reviewedDecisionFixture()
      f.row.quoteVersion[field] = `Legacy ${field} [[qa-reject]]`
      const { plan } = await inspect(f)
      await expect(
        prepareReviewedCommerceQuoteApproval(plan),
      ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
      noBusinessWrites(f)
    }
  })
})

test("source revision-only drift changes the actual linked presentation fact and requires a fresh pending review", async () => {
  await configured(async (_local, production) => {
    const f = reviewedDecisionFixture()
    f.links(1)
    const { proof } = await prepared(f)
    f.source.revision++
    production()
    await expect(approve(f, proof)).rejects.toThrow()
    noBusinessWrites(f)
  })
})
