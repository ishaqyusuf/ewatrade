import { expect, mock, test } from "bun:test"
import type { WorkJob } from "@/components/service-work/service-utils"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const clicks = new Map<string, () => void>()
const wrap = ({ children }: { children: ReactNode }) => <div>{children}</div>
mock.module("@/components/tables/core", () => ({ selectColumn: () => ({}) }))
mock.module("@ewatrade/ui", () => ({
  Badge: wrap,
  Button: wrap,
  DropdownMenu: wrap,
  DropdownMenuContent: wrap,
  DropdownMenuItem: ({
    children,
    onClick,
  }: { children: ReactNode; onClick: () => void }) => {
    clicks.set(String(children), onClick)
    return <button type="button">{children}</button>
  },
  DropdownMenuRadioGroup: wrap,
  DropdownMenuRadioItem: wrap,
  DropdownMenuTrigger: ({ render }: { render: ReactNode }) => render,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}))
const { ServiceWorkRowActions } = await import("./columns")

test("completed unpaid work keeps Take payment in Actions and opens the existing payment step", () => {
  const opened: unknown[] = []
  const html = renderToStaticMarkup(
    <ServiceWorkRowActions
      job={
        {
          id: "job",
          orderNumber: "ORD-006",
          summary: "completed",
          balanceDueMinor: 975_000,
          lines: [],
        } as unknown as WorkJob
      }
      actions={{
        canManage: true,
        isPending: false,
        timeZone: "Africa/Lagos",
        assigneeName: () => null,
        openJob: () => {},
        quickStep: () => {},
        openStep: (id, step) => opened.push({ id, step }),
      }}
    />,
  )
  expect(html).toContain("Take payment")
  expect(html).toContain("Hand over to customer")
  expect(html).not.toContain("Cancel work")
  expect(html).not.toContain("Change due date")
  clicks.get("Take payment")?.()
  expect(opened).toEqual([{ id: "job", step: "pay" }])
})
