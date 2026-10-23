import { expect, test } from "bun:test"
import { resolveServiceIntakeCustomer } from "./service-intake-customer"
import type { DbClient } from "./types"

function fixture(matches: Array<{ id: string }> = []) {
  const writes: unknown[] = []
  const reads: unknown[] = []
  const tx = {
    customer: {
      findMany: async (input: unknown) => {
        reads.push(input)
        return matches
      },
      findFirst: async ({
        where,
      }: { where: { tenantId: string; id?: string } }) =>
        where.tenantId === "freshcare" && where.id === "saved"
          ? { id: "saved" }
          : null,
      create: async ({ data }: { data: unknown }) => {
        writes.push(data)
        return { id: "new" }
      },
    },
  } as unknown as DbClient
  return { tx, writes, reads }
}
test("a reviewed name-only customer uses the owning transaction and never requires contact details", async () => {
  const f = fixture()
  expect(
    await resolveServiceIntakeCustomer(f.tx, {
      tenantId: "freshcare",
      saveNewCustomer: true,
      customerName: "Ishaq Yusuf",
    }),
  ).toBe("new")
  expect(f.writes).toEqual([
    {
      tenantId: "freshcare",
      name: "Ishaq Yusuf",
      phone: null,
      email: null,
      normalizedEmail: null,
      normalizedPhone: null,
    },
  ])
  expect(f.reads).toEqual([
    {
      where: {
        tenantId: "freshcare",
        name: { equals: "Ishaq Yusuf", mode: "insensitive" },
      },
      take: 2,
      select: { id: true },
    },
  ])
})
test("a newly saved exact name is reused and ambiguity refuses without writes", async () => {
  const f = fixture([{ id: "existing" }])
  expect(
    await resolveServiceIntakeCustomer(f.tx, {
      tenantId: "freshcare",
      saveNewCustomer: true,
      customerName: "Ishaq Yusuf",
    }),
  ).toBe("existing")
  expect(f.writes).toHaveLength(0)
  const ambiguous = fixture([{ id: "one" }, { id: "two" }])
  await expect(
    resolveServiceIntakeCustomer(ambiguous.tx, {
      tenantId: "freshcare",
      saveNewCustomer: true,
      customerName: "Ishaq Yusuf",
    }),
  ).rejects.toThrow("More than one")
  expect(ambiguous.writes).toHaveLength(0)
})
test("saved identity stays tenant scoped; no selection means no customer write", async () => {
  const f = fixture()
  expect(
    await resolveServiceIntakeCustomer(f.tx, {
      tenantId: "freshcare",
      customerId: "saved",
    }),
  ).toBe("saved")
  await expect(
    resolveServiceIntakeCustomer(f.tx, {
      tenantId: "foreign",
      customerId: "saved",
    }),
  ).rejects.toThrow("no longer available")
  await expect(
    resolveServiceIntakeCustomer(f.tx, {
      tenantId: "freshcare",
      customerId: "saved",
      saveNewCustomer: true,
    }),
  ).rejects.toThrow("existing customer or add")
  expect(
    await resolveServiceIntakeCustomer(f.tx, { tenantId: "freshcare" }),
  ).toBeUndefined()
  expect(f.writes).toHaveLength(0)
})
