import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  getCustomerLedgerAccountDetail,
  listCustomerLedgerAccounts,
} from "./account-reads"
import { ensureCustomerLedgerAccount } from "./accounts"

describeWithServiceCommerceDatabase("customer finance read authority", () => {
  test("a shared owner cannot cross Tenant scope and role revocation blocks later reads", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `customer-reads-${suffix}@example.invalid`,
        name: "Customer read QA",
      },
    })
    const tenantIds: string[] = []
    try {
      for (const name of ["first", "second"]) {
        const tenant = await db.tenant.create({
          data: {
            slug: `customer-reads-${name}-${suffix}`,
            name: `Customer read QA ${name}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
      }
      const tenantId = tenantIds[0]
      const foreignTenantId = tenantIds[1]
      if (!tenantId || !foreignTenantId)
        throw new Error("Missing QA businesses")
      const actor = { tenantId, actorUserId: user.id }
      const customer = await db.customer.create({
        data: { tenantId, name: "Private customer" },
      })
      const account = await ensureCustomerLedgerAccount(db, {
        ...actor,
        customerId: customer.id,
        currencyCode: "NGN",
      })
      const foreignActor = { ...actor, tenantId: foreignTenantId }
      await expect(
        listCustomerLedgerAccounts(db, {
          ...foreignActor,
          customerId: customer.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        getCustomerLedgerAccountDetail(db, {
          ...foreignActor,
          accountId: account.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(
        (
          await getCustomerLedgerAccountDetail(db, {
            ...actor,
            accountId: account.id,
          })
        ).totals.outstandingDebtMinor,
      ).toBe("0")
      expect(
        (
          await listCustomerLedgerAccounts(db, {
            ...actor,
            customerId: customer.id,
          })
        ).accounts,
      ).toHaveLength(1)
      const membership = await db.membership.findFirstOrThrow({
        where: { tenantId, userId: user.id },
      })
      await db.membership.update({
        where: { id: membership.id },
        data: { role: "ADMIN" },
      })
      expect(
        (
          await getCustomerLedgerAccountDetail(db, {
            ...actor,
            accountId: account.id,
          })
        ).customer.name,
      ).toBe("Private customer")
      await db.membership.update({
        where: { id: membership.id },
        data: { role: "MANAGER" },
      })
      await expect(
        getCustomerLedgerAccountDetail(db, { ...actor, accountId: account.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        listCustomerLedgerAccounts(db, { ...actor, customerId: customer.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.membership.update({
        where: { id: membership.id },
        data: { role: "OWNER", status: "SUSPENDED" },
      })
      await expect(
        getCustomerLedgerAccountDetail(db, { ...actor, accountId: account.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.membership.update({
        where: { id: membership.id },
        data: { status: "ACTIVE" },
      })
      await db.tenant.update({
        where: { id: tenantId },
        data: { isActive: false },
      })
      await expect(
        listCustomerLedgerAccounts(db, { ...actor, customerId: customer.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    } finally {
      // These IDs exist only in this test and are never sourced from a merchant or environment.
      for (const tenantId of tenantIds) {
        await db.customerLedgerAccount.deleteMany({ where: { tenantId } })
        await db.tenant.delete({ where: { id: tenantId } })
      }
      await db.user.delete({ where: { id: user.id } })
    }
  }, 120_000)
})
