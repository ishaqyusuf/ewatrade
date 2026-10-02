import { describe, expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { resolveInventoryCloseoutSourceInTransaction as resolve } from "./inventory-closeout-source"
import {
  effectiveAt,
  closeoutFixture as fixture,
  closeoutInput as input,
} from "./inventory-closeout-test-fixture"

const decimal = (value: string) => new Prisma.Decimal(value)

describe("immutable custody closeout source proof", () => {
  test("resolves packaged and canonical shared shortages from persisted lines", async () => {
    for (const packaged of [false, true]) {
      const f = fixture({ packaged })
      const source = await resolve(f.tx, { ...input, expectedBookId: "book" })
      expect(source.nonzeroLines).toHaveLength(1)
      expect(source.nonzeroLines[0]?.before).toBe(packaged ? "48" : "4")
      expect(source.nonzeroLines[0]?.after).toBe(packaged ? "36" : "3")
      expect(source.nonzeroLines[0]?.effect).toBe(packaged ? "-12" : "-1")
      expect(source.operation.actorUserId).toBe("finalizer")
      expect(source.book?.id).toBe("book")
    }
  })
  test("zero lines have no movements and gains retain their explicit positive effect", async () => {
    const zero = fixture({ zero: true })
    expect((await resolve(zero.tx, input)).nonzeroLines).toHaveLength(0)
    zero.operation.movements.push(zero.movement)
    await expect(resolve(zero.tx, input)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    const gain = fixture({ packaged: true, gain: true })
    expect((await resolve(gain.tx, input)).nonzeroLines[0]?.effect).toBe("12")
  })
  test("immutable proof remains available after mutable status, stock and close-date changes", async () => {
    const f = fixture()
    f.closeout.status = "CANCELLED"
    f.balance.revision = 90
    f.balance.onHandQuantity = decimal("77")
    f.book.closedThrough = effectiveAt
    f.operation._count.corrections = 1
    const source = await resolve(f.tx, input)
    expect(source.nonzeroLines[0]?.after).toBe("3")
    expect(source.corrections).toBe(1)
  })
  test("no Book is explicit, while the held Book identity cannot disappear or change", async () => {
    const noBook = fixture({ noBook: true })
    expect((await resolve(noBook.tx, input)).book).toBeNull()
    await expect(
      resolve(noBook.tx, { ...input, expectedBookId: "book" }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    const wrongBook = fixture()
    await expect(
      resolve(wrongBook.tx, { ...input, expectedBookId: "foreign" }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
  test("rejects competing owners, foreign custody and malformed source chains before Book access", async () => {
    const probes = [
      (f: ReturnType<typeof fixture>) => {
        f.operation.committedReservation = { id: "reservation" }
      },
      (f: ReturnType<typeof fixture>) => {
        f.operation._count.finalizedCounts = 1
      },
      (f: ReturnType<typeof fixture>) => {
        f.operation._count.finalizedCloseouts = 2
      },
      (f: ReturnType<typeof fixture>) => {
        f.operation.tenantId = "foreign"
      },
      (f: ReturnType<typeof fixture>) => {
        f.closeout.finalizedOperationId = "different"
      },
      (f: ReturnType<typeof fixture>) => {
        f.closeout.finalizedAt = new Date("2026-09-30T10:00:00Z")
      },
      (f: ReturnType<typeof fixture>) => {
        f.balance.custodyReferenceId = "other-staff"
      },
      (f: ReturnType<typeof fixture>) => {
        f.parent.tenantId = "foreign"
      },
      (f: ReturnType<typeof fixture>) => {
        f.balance.product.catalogItem.tenantId = "foreign"
      },
      (f: ReturnType<typeof fixture>) => {
        f.balance.variant.catalogItemId = "other"
      },
      (f: ReturnType<typeof fixture>) => {
        f.unit.configurationVersion.productId = "other"
      },
      (f: ReturnType<typeof fixture>) => {
        f.line.varianceQuantity = decimal("-2")
      },
      (f: ReturnType<typeof fixture>) => {
        f.movement.signedCanonicalEffect = decimal("-2")
      },
      (f: ReturnType<typeof fixture>) => {
        f.movement.purchaseReceipt = { id: "receipt" }
      },
      (f: ReturnType<typeof fixture>) => {
        f.movement.reversalOfMovementId = "inverse"
      },
      (f: ReturnType<typeof fixture>) => {
        f.operation.movements.push({ ...f.movement, id: "duplicate" })
      },
      (f: ReturnType<typeof fixture>) => {
        f.closeout.lines.push({ ...f.line, id: "duplicate" })
      },
      (f: ReturnType<typeof fixture>) => {
        f.line.expectedQuantity = decimal("-1")
      },
    ]
    for (const mutate of probes) {
      const f = fixture()
      mutate(f)
      await expect(resolve(f.tx, input)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(f.bookReads()).toBe(0)
    }
  })
})
