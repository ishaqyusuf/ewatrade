import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import {
  generalReceivablesAnswers,
  generalReceivablesInput,
} from "./general-receivables"

test("receivable cards retain bigint precision and distinguish account debt from page totals", () => {
  const answers = generalReceivablesAnswers(
    {
      scope: "ACCOUNT_PAGE",
      coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
      nextCursor: "account",
      items: [
        {
          id: "account",
          customer: { id: "customer", name: "QA", email: null, phone: null },
          currencyCode: "NGN",
          totals: {
            debitMinor: "9007199254740993",
            creditMinor: "200",
            allocatedMinor: "75",
            outstandingDebtMinor: "9007199254740918",
            availableCreditMinor: "125",
            netBalanceMinor: "9007199254740793",
          },
        },
      ],
    },
    { query: "%", cursor: "previous" },
  )
  expect(
    answers.every((answer) => generalAnswerSchema.safeParse(answer).success),
  ).toBe(true)
  expect(answers[1]?.value).toBe("Debt ₦90,071,992,547,409.18")
  expect(answers[1]?.detail).toContain("credit ₦1.25")
  expect(answers[0]?.detail).toContain("Continuation page")
  expect(answers[0]?.detail).toContain("not a business total")
  expect(answers[0]?.detail).toContain("Unintegrated orders are excluded")
  expect(generalReceivablesInput.safeParse({ tenantId: "other" }).success).toBe(
    false,
  )
  expect(generalReceivablesInput.safeParse({ limit: 100 }).success).toBe(false)
  expect(
    respondGeneralRehearsal([
      {
        role: "user",
        content: "list receivables matching Amina after account",
      },
    ]),
  ).toMatchObject({
    toolName: "readReceivables",
    input: { query: "Amina", cursor: "account" },
  })
})
