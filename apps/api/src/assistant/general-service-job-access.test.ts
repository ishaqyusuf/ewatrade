import { expect, test } from "bun:test"
import type { GeneralContext } from "./general-context"
import { serviceIntakeFromJobDraft } from "./general-service-job-draft"
import { createGeneralTools } from "./general-tools"

test("the service job preparer is available to Dashboard and mobile owners", () => {
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  const previousPreparation = process.env.ASSISTANT_COMMERCE_PREPARATION_ENABLED
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
  try {
    const ctx = {
      session: { user: { id: "owner" }, session: { id: "session" } },
      requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
      tenantContext: {
        tenant: {
          id: "freshcare",
          dataClassification: "QA",
          retailOpsPlanId: "pro",
        },
        membership: { role: "OWNER" },
        activeStore: { id: "main" },
        stores: [{ id: "main" }],
        staffAccess: {
          businessRole: "OWNER",
          status: "ACTIVE",
          mode: "LEGACY",
          catalogEditor: false,
          assignments: [],
        },
      },
    } as unknown as GeneralContext
    const tools = createGeneralTools(
      ctx,
      "chat",
      () => {},
      () => {},
    )
    expect(Object.keys(tools)).toContain("prepareServiceJob")
    expect(Object.keys(tools)).toContain("prepareOrder")
    expect(Object.keys(tools)).toContain("searchProductCategories")
    expect(Object.keys(tools)).toContain("readProductCategoryAttributes")
    expect(
      Object.keys(
        createGeneralTools(
          { ...ctx, requestHeaders: new Headers() },
          "chat",
          () => {},
          () => {},
        ),
      ),
    ).toContain("prepareServiceJob")
    process.env.ASSISTANT_COMMERCE_PREPARATION_ENABLED = "false"
    const fallback = Object.keys(
      createGeneralTools(
        ctx,
        "chat",
        () => {},
        () => {},
      ),
    )
    expect(fallback).not.toContain("prepareOrder")
    expect(fallback).not.toContain("prepareServiceJob")
    expect(fallback).not.toContain("searchProductCategories")
    expect(fallback).not.toContain("readProductCategoryAttributes")
    expect(fallback).toContain("draftAction")
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
    if (previousPreparation === undefined)
      Reflect.deleteProperty(
        process.env,
        "ASSISTANT_COMMERCE_PREPARATION_ENABLED",
      )
    else
      process.env.ASSISTANT_COMMERCE_PREPARATION_ENABLED = previousPreparation
  }
})

test("mobile job preparation keeps exact saved choices and refuses unresolved prices", () => {
  const line = {
    name: "Jalabia · Wash & iron",
    offeringId: "laundry-offering",
    quantity: "20",
    unitPriceMinor: 40000,
  }
  const draft = {
    origin: { tenantId: "freshcare", storeId: "main" },
    currencyCode: "NGN",
    customer: {
      id: "saved-customer",
      name: "QA Customer",
      phone: null,
      email: null,
    },
    lines: [line],
    assumptions: [],
  }
  expect(serviceIntakeFromJobDraft(draft)).toEqual({
    action: "service_intake",
    customerId: "saved-customer",
    lines: [{ offeringId: "laundry-offering", quantity: "20" }],
  })
  expect(
    serviceIntakeFromJobDraft({
      ...draft,
      customerIssue: "Ambiguous customer",
    }),
  ).toBeNull()
  expect(
    serviceIntakeFromJobDraft({
      ...draft,
      lines: [{ ...line, quoteRequired: true, unitPriceMinor: undefined }],
    }),
  ).toBeNull()
})
