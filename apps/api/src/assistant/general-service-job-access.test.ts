import { expect, test } from "bun:test"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

test("the form-only job preparer is available to a dashboard owner without enabling signed intake or WhatsApp writes", () => {
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
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
    expect(
      Object.keys(
        createGeneralTools(
          { ...ctx, requestHeaders: new Headers() },
          "chat",
          () => {},
          () => {},
        ),
      ),
    ).not.toContain("prepareServiceJob")
  } finally {
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
  }
})
