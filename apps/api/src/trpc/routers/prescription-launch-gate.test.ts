import { expect, test } from "bun:test"

import { createCallerFactory } from "../init"
import { prescriptionAccessRouter } from "./prescription-access"
import { serviceCommerceIntakeRouter } from "./service-commerce/intake"

test("public prescription deep links stop before database access when launch is closed", async () => {
  const previousAppEnv = process.env.APP_ENV
  const previousApproval = process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED
  process.env.APP_ENV = "production"
  process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = "false"
  try {
    const caller = createCallerFactory(prescriptionAccessRouter)({
      db: new Proxy(
        {},
        {
          get() {
            throw new Error("Database should not be read")
          },
        },
      ),
      requestId: "request-test",
    } as never)
    const token = "x".repeat(20)
    const media = {
      clientMediaId: "page-1",
      mediaType: "image/jpeg" as const,
      objectKey: "private/page-1",
      originalFileName: "page.jpg",
      pageNumber: 1,
      sha256: "a".repeat(64),
      sizeBytes: 100,
    }
    const publicActions = [
      () => caller.channel({ publicToken: token }),
      () => caller.status({ statusToken: token }),
      () => caller.paymentStatus({ statusToken: token }),
      () =>
        caller.createCheckout({
          acceptanceToken: token,
          clientPaymentId: "payment-1",
          statusToken: token,
        }),
      () =>
        caller.uploadMedia({
          base64: "ZmlsZQ==",
          clientMediaId: "page-1",
          mediaType: "image/jpeg",
          originalFileName: "page.jpg",
          pageNumber: 1,
          publicToken: token,
        }),
      () =>
        caller.submit({
          clientRequestId: "request-1",
          consentAccepted: true,
          consentVersion: "draft-test",
          customerPhone: "+2348000000000",
          fulfilmentPreference: "pickup",
          media: [media],
          publicToken: token,
        }),
    ]
    for (const action of publicActions) {
      await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
    process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = previousApproval ?? ""
  }
})

test("generic public Prescription intake returns disabled before database access", async () => {
  const previousAppEnv = process.env.APP_ENV
  const previousApproval = process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED
  process.env.APP_ENV = "preview"
  process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = "true"
  try {
    const caller = createCallerFactory(serviceCommerceIntakeRouter)({
      db: new Proxy(
        {},
        {
          get() {
            throw new Error("Database should not be read")
          },
        },
      ),
      requestId: "request-test",
    } as never)
    await expect(
      caller.submitPublicIntake({
        channel: "web",
        clientCommandId: "prescription-1",
        consent: {
          contactOptIn: false,
          privacyNoticeVersion: "review-version",
        },
        context: { kind: "entry_point", token: "entry-1" },
        intent: {
          customer: { name: "Ada" },
          fulfilmentPreference: "pickup",
          kind: "prescription",
          manualIntakeText: "Prescription details",
        },
      }),
    ).resolves.toEqual({
      action: "contact_business",
      code: "disabled",
      status: "recovery",
    })
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
    process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = previousApproval ?? ""
  }
})
