import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { replaceDueReminder } from "./service-due-reminders"

function fixture() {
  const calls: string[] = []
  const cancellations: unknown[] = []
  const saves: unknown[] = []
  const state = {
    auto: true,
    channel: "SMS",
    timezone: "America/New_York" as string | null,
    cancellationError: null as Error | null,
  }
  const tx = {
    serviceNotificationIntent: {
      updateMany: async (args: unknown) => {
        calls.push("cancel")
        cancellations.push(args)
        if (state.cancellationError) throw state.cancellationError
        return { count: 1 }
      },
      upsert: async (args: unknown) => {
        calls.push("save")
        saves.push(args)
        return { id: "intent" }
      },
    },
    serviceStoreSettings: {
      findUnique: async () => {
        calls.push("settings")
        return {
          autoNotifyReminder: state.auto,
          defaultNotificationChannel: state.channel,
          reminderLeadMinutes: 15,
        }
      },
    },
    tenant: {
      findUnique: async () => {
        calls.push("timezone")
        return state.timezone ? { timezone: state.timezone } : null
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, state, calls, cancellations, saves }
}
const input = {
  actorUserId: "actor",
  channel: null,
  customerPhone: "synthetic-phone",
  orderNumber: "ORD-001",
  promisedAt: new Date("2100-01-15T10:00:00.123Z"),
  serviceJobId: "job",
  storeId: "store",
  tenantId: "tenant",
}

test("absent phone still cancels pending/ready reminders before skipping all eligibility reads", async () => {
  for (const customerPhone of [null, ""]) {
    const f = fixture()
    expect(
      await replaceDueReminder(f.tx, { ...input, customerPhone }),
    ).toBeNull()
    expect(f.calls).toEqual(["cancel"])
    expect(f.cancellations).toEqual([
      {
        data: { status: "CANCELLED" },
        where: {
          serviceJobId: "job",
          status: { in: ["PENDING", "READY"] },
          templatePurpose: "due_reminder",
        },
      },
    ])
    expect(f.saves).toHaveLength(0)
  }
})

test("disabled automation or unsupported default channel skips timezone after cancellation/settings", async () => {
  for (const mode of ["disabled", "bad-channel"]) {
    const f = fixture()
    if (mode === "disabled") f.state.auto = false
    else f.state.channel = "NONE"
    expect(await replaceDueReminder(f.tx, input)).toBeNull()
    expect(f.calls).toEqual(["cancel", "settings"])
  }
})

test("eligible reminder keeps explicit channel, timezone text, subsecond schedule and idempotent key", async () => {
  const f = fixture()
  expect(
    (await replaceDueReminder(f.tx, { ...input, channel: "WHATSAPP" }))?.id,
  ).toBe("intent")
  expect(f.calls).toEqual(["cancel", "settings", "timezone", "save"])
  expect(f.saves[0]).toMatchObject({
    create: {
      channel: "WHATSAPP",
      customerPhone: "synthetic-phone",
      scheduledFor: new Date("2100-01-15T09:45:00.123Z"),
      createdByUserId: "actor",
      status: "PENDING",
      serviceJobId: "job",
      storeId: "store",
      tenantId: "tenant",
      renderedMessage:
        "Reminder: order ORD-001 is expected to be ready by 15/01/2100, 05:00:00.",
    },
    update: {
      channel: "WHATSAPP",
      scheduledFor: new Date("2100-01-15T09:45:00.123Z"),
      status: "PENDING",
    },
    where: {
      tenantId_businessEventKey_audienceKey_templatePurpose: {
        audienceKey: "ORD-001",
        businessEventKey: "job:due-reminder:2100-01-15T10:00:00.123Z",
        templatePurpose: "due_reminder",
        tenantId: "tenant",
      },
    },
  })
})

test("truthy whitespace phone and missing timezone retain native truthiness/default behavior", async () => {
  const f = fixture()
  f.state.timezone = null
  await replaceDueReminder(f.tx, {
    ...input,
    customerPhone: " ",
    promisedAt: new Date("2000-01-15T10:00:00Z"),
  })
  expect(f.calls).toEqual(["cancel", "settings", "timezone", "save"])
  expect(f.saves[0]).toMatchObject({
    create: {
      customerPhone: " ",
      channel: "SMS",
      status: "READY",
      renderedMessage:
        "Reminder: order ORD-001 is expected to be ready by 15/01/2000, 11:00:00.",
    },
  })
})

test("cancellation failure propagates before any reads or replacement write", async () => {
  const f = fixture()
  const failure = Error("cancellation failed")
  f.state.cancellationError = failure
  await expect(replaceDueReminder(f.tx, input)).rejects.toBe(failure)
  expect(f.calls).toEqual(["cancel"])
  expect(f.saves).toHaveLength(0)
})
