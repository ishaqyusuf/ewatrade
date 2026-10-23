import { describe, expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  type IssueCommerceQuoteInput,
  issueCommerceQuote,
} from "./commerce-quotes"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"

/** A native Error with a different constructor, like a retained hot-reload runtime. */
class PreviousRuntimePrismaError extends Error {
  name = "PrismaClientKnownRequestError"
  code = "P2034"
  clientVersion = "7.6.0-fixture"
}

const currentError = (code = "P2034", meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("Synthetic transaction failure", {
    code,
    clientVersion: "7.6.0-fixture",
    meta,
  })
const quoteInput = {
  actorUserId: "actor-fixture",
  availabilityOutcome: "unavailable",
  clientQuoteId: "quote-identity-fixture",
  clientVersionId: "version-identity-fixture",
  lines: [{ outcome: "unavailable", sourceLineId: "line-fixture" }],
  sourceId: "request-fixture",
  sourceType: "service_request",
  storeId: "store-fixture",
  tenantId: "tenant-fixture",
} satisfies IssueCommerceQuoteInput
const publication = {
  version: "quote-identity-fixture",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-09-28",
}
const transactionOptions = {
  isolationLevel: "Serializable",
  maxWait: 10_000,
  timeout: 30_000,
}

function failingClient(error: unknown) {
  const options: unknown[] = []
  const db = {
    $transaction: async (_execute: unknown, settings: unknown) => {
      options.push(settings)
      throw error
    },
  } as unknown as PrismaClient
  return { db, options }
}

const operations = [
  {
    name: "issueCommerceQuote",
    domainCode: "QUOTE_CONFLICT",
    run: (db: PrismaClient) => issueCommerceQuote(db, quoteInput, publication),
  },
  {
    name: "runStoreConversationActionTransaction",
    domainCode: "CONFLICT",
    run: (db: PrismaClient) =>
      runStoreConversationActionTransaction(db, async () => "unused"),
  },
]

describe("bounded transaction retries across Prisma constructor identities", () => {
  for (const operation of operations) {
    for (const identity of ["current", "previous runtime"]) {
      test(`${operation.name}: ${identity} P2034 gets two attempts then its domain conflict`, async () => {
        const error =
          identity === "current"
            ? currentError()
            : new PreviousRuntimePrismaError(
                "Synthetic previous runtime failure",
              )
        expect(error).toBeInstanceOf(Error)
        expect(error instanceof Prisma.PrismaClientKnownRequestError).toBe(
          identity === "current",
        )
        const { db, options } = failingClient(error)
        const caught = await operation.run(db).then(
          () => null,
          (failure: unknown) => failure,
        )
        expect(options).toEqual([transactionOptions, transactionOptions])
        expect(caught).toMatchObject({ code: operation.domainCode })
        expect(caught).not.toBe(error)
      })
    }

    const unrelated = [
      {
        name: "a plain object",
        error: {
          name: "PrismaClientKnownRequestError",
          code: "P2034",
          clientVersion: "7.6.0-fixture",
        },
      },
      {
        name: "an ordinary domain Error",
        error: Object.assign(new Error("Domain refusal"), {
          code: "P2034",
          clientVersion: "7.6.0-fixture",
        }),
      },
      {
        name: "missing clientVersion",
        error: Object.assign(new Error("Incomplete lookalike"), {
          name: "PrismaClientKnownRequestError",
          code: "P2034",
        }),
      },
      {
        name: "a blank clientVersion",
        error: Object.assign(new Error("Incomplete lookalike"), {
          name: "PrismaClientKnownRequestError",
          code: "P2034",
          clientVersion: "   ",
        }),
      },
      {
        name: "another domain code",
        error: Object.assign(new PreviousRuntimePrismaError("Domain refusal"), {
          code: "QUOTE_CONFLICT",
        }),
      },
      {
        name: "a genuine unrelated Prisma error",
        error: currentError("P2003"),
      },
    ]
    for (const { name, error } of unrelated) {
      test(`${operation.name}: ${name} propagates unchanged without retry`, async () => {
        const { db, options } = failingClient(error)
        await expect(operation.run(db)).rejects.toBe(error)
        expect(options).toEqual([transactionOptions])
      })
    }
  }

  for (const identity of ["current", "previous runtime"]) {
    test(`conversation callback can succeed in a fresh second transaction after ${identity} P2034`, async () => {
      const error =
        identity === "current"
          ? currentError()
          : new PreviousRuntimePrismaError("Synthetic abort")
      const options: unknown[] = []
      const executions: Prisma.TransactionClient[] = []
      const db = {
        $transaction: async <T>(
          execute: (tx: Prisma.TransactionClient) => Promise<T>,
          settings: unknown,
        ) => {
          options.push(settings)
          const tx = {} as Prisma.TransactionClient
          const result = await execute(tx)
          if (options.length === 1) throw error // Simulated commit abort, before any external effect.
          return result
        },
      } as unknown as PrismaClient
      const result = await runStoreConversationActionTransaction(
        db,
        async (tx) => {
          executions.push(tx)
          return { result: "second transaction completed" }
        },
      )
      expect(result).toEqual({ result: "second transaction completed" })
      expect(options).toEqual([transactionOptions, transactionOptions])
      expect(executions).toHaveLength(2)
      expect(executions[0]).not.toBe(executions[1])
    })
  }

  for (const error of [
    currentError("P2002"),
    currentError("P2010", { code: "40001" }),
  ]) {
    test(`conversation's existing ${error.code} retry still uses the original bound`, async () => {
      const { db, options } = failingClient(error)
      await expect(
        runStoreConversationActionTransaction(db, async () => "unused"),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(options).toEqual([transactionOptions, transactionOptions])
    })
  }
})

describe("transaction options belong to one attempt", () => {
  for (const operation of operations) {
    test(`${operation.name}: an aborted attempt cannot poison its retry or the next operation`, async () => {
      const references: object[] = []
      const receivedValues: Record<string, unknown>[] = []
      let original:
        | { target: object; descriptors: PropertyDescriptorMap }
        | undefined
      const db = {
        $transaction: async (
          _execute: unknown,
          settings: Record<string, unknown>,
        ) => {
          references.push(settings)
          receivedValues.push({ ...settings })
          if (references.length === 1) {
            original = {
              target: settings,
              descriptors: Object.getOwnPropertyDescriptors(settings),
            }
            // Simulate Prisma annotating an aborted transaction's options object.
            Reflect.set(settings, "newTxId", "synthetic-aborted-transaction")
            Reflect.set(settings, "timeout", 1)
          }
          throw currentError()
        },
      } as unknown as PrismaClient
      try {
        // Exercise both retry attempts and a later invocation before asserting.
        // No issuance callback runs and no successful Quote is being simulated.
        for (let invocation = 0; invocation < 2; invocation++) {
          await expect(operation.run(db)).rejects.toMatchObject({
            code: operation.domainCode,
          })
        }
        expect(references).toHaveLength(4)
        expect(receivedValues).toEqual(
          Array.from({ length: 4 }, () => transactionOptions),
        )
        expect(new Set(references).size).toBe(4)
      } finally {
        // RED against a shared constant must never leak mutation into other tests.
        if (original) {
          for (const key of Reflect.ownKeys(original.target)) {
            if (!Reflect.has(original.descriptors, key))
              Reflect.deleteProperty(original.target, key)
          }
          Object.defineProperties(original.target, original.descriptors)
        }
      }
    })
  }
})
