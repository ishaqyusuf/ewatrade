import { expect, mock, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("@/components/open-business-report-sheet", () => ({
  OpenBusinessReportSheet: () => <button type="button">Open report</button>,
}))
const { GeneralAnswerCard } = await import("./general-answer-card")

const answer = {
  id: "a1",
  title: "Sales today",
  value: "₦12,450.00",
  detail: "6 paid orders. 2 orders still owe ₦1,250.00.",
  scope: "Jawdah Poultry QA · Main store",
  asOf: "2026-10-12T09:21:00.000Z",
} as GeneralAnswer

test("an answer reads value, meaning, then where it came from", () => {
  const html = renderToStaticMarkup(<GeneralAnswerCard answer={answer} />)
  const at = (text: string) => html.indexOf(text)
  expect(at("Sales today")).toBeLessThan(at("₦12,450.00"))
  expect(at("₦12,450.00")).toBeLessThan(at("6 paid orders"))
  expect(at("6 paid orders")).toBeLessThan(at("Jawdah Poultry QA · Main store"))
  expect(html).not.toContain("Open report")
})

test("the original record opens from beside the answer", () => {
  const html = renderToStaticMarkup(
    <GeneralAnswerCard
      answer={
        {
          ...answer,
          target: { kind: "business_report" },
        } as unknown as GeneralAnswer
      }
    />,
  )
  expect(html).toMatch(
    /<div class="shrink-0"><button[^>]*>Open report<\/button>/,
  )
})
