import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ReceiptAppointment, preferredDateNote } from "./receipt"

const booked = {
  status: "CONFIRMED",
  startsAt: "2026-10-31T09:00:00.000Z",
  endsAt: "2026-10-31T09:30:00.000Z",
  timezone: "Africa/Lagos",
  serviceName: "Alterations · Trouser hem",
}
const render = (appointment: typeof booked) =>
  renderToStaticMarkup(
    <ReceiptAppointment appointment={appointment} fallbackName="Alterations" />,
  )

test("a booked appointment shows what, when (business time zone) and that it is booked", () => {
  const html = render(booked)
  expect(html).toContain("Alterations · Trouser hem")
  expect(html).toContain("Saturday, 31 October")
  expect(html).toMatch(/10:00.*to.*10:30/)
  expect(html).toContain(">Booked<")
  expect(html).toContain("<strong>")
  expect(html).not.toContain("<del")
})

test("cancelled and missed appointments are not shown as booked", () => {
  for (const [status, label] of [
    ["CANCELLED", "Cancelled"],
    ["NO_SHOW", "Missed"],
  ] as const) {
    const html = render({ ...booked, status })
    expect(html).toContain(`>${label}<`)
    expect(html).not.toContain(">Booked<")
    expect(html).toContain("<del")
  }
})

test("without the host's service name, the request's services name the appointment", () => {
  const html = render({ ...booked, serviceName: "" })
  expect(html).toContain("<p>Alterations</p>")
})

test("a preferred date is only ever a preference", () => {
  expect(preferredDateNote(undefined)).toBe(
    " (your preference, not booked yet)",
  )
  expect(preferredDateNote("CANCELLED")).toBe(
    " (your preference, not booked yet)",
  )
  expect(preferredDateNote("CONFIRMED")).toBe(
    " (your preference, not the booked time)",
  )
  for (const status of [undefined, "CONFIRMED", "CANCELLED"])
    expect(preferredDateNote(status)).not.toMatch(/confirmed|booked for/i)
})
