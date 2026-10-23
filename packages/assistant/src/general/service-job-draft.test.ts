import { expect, test } from "bun:test"
import {
  resolveServiceJobLines,
  serviceJobRequestSchema,
} from "./service-job-draft"

const choices = [
  { offeringId: "shirt", name: "Shirt · Wash & iron", unitPriceMinor: 20_000 },
  {
    offeringId: "trousers-wash",
    name: "Trousers · Wash & iron",
    unitPriceMinor: 15_000,
  },
  {
    offeringId: "trousers-iron",
    name: "Trousers · Iron only",
    unitPriceMinor: 10_000,
  },
]
const request = serviceJobRequestSchema.parse({
  lines: [
    { name: "shirt", treatment: "wash_and_iron", quantity: "40" },
    { name: "trouser", treatment: "wash_and_iron", quantity: "5" },
    { name: "trouser", treatment: "iron_only", quantity: "5" },
    { name: "socks", treatment: "wash_and_iron", quantity: "5" },
  ],
})

test("mixed laundry resolves saved prices and asks only the missing socks price", () => {
  const result = resolveServiceJobLines(request, choices)
  expect(result.questions).toEqual([
    "What is the price per socks for wash & iron?",
  ])
  expect(
    result.lines.map((line) => [
      line.offeringId,
      line.quantity,
      line.totalMinor,
    ]),
  ).toEqual([
    ["shirt", "40", 800_000],
    ["trousers-wash", "5", 75_000],
    ["trousers-iron", "5", 50_000],
  ])
  expect(JSON.stringify(result)).not.toMatch(/payment|phone|due date/i)
})

test("stated missing price completes the whole job; it does not override saved prices", () => {
  const result = resolveServiceJobLines(
    {
      ...request,
      lines: request.lines.map((line) => ({ ...line, unitPrice: "100" })),
    },
    choices,
  )
  expect(result.questions).toEqual([])
  expect(result.lines).toHaveLength(4)
  expect(result.lines[0]?.unitPriceMinor).toBe(20_000)
  expect(result.lines[3]).toEqual({
    name: "socks · Wash & iron",
    quantity: "5",
    unitPriceMinor: 10_000,
    totalMinor: 50_000,
  })
  expect(result.lines.reduce((sum, line) => sum + line.totalMinor, 0)).toBe(
    975_000,
  )
})

test("same-name offerings are clarified, and quantity must produce exact currency", () => {
  expect(
    resolveServiceJobLines({ lines: request.lines.slice(0, 1) }, [
      ...choices,
      {
        name: "Shirt · Wash & iron",
        unitPriceMinor: 20_000,
        offeringId: "other",
      },
    ]).questions,
  ).toHaveLength(1)
  const invalid = {
    lines: [
      {
        name: "shirt",
        treatment: "wash_and_iron" as const,
        quantity: "0.000001",
      },
    ],
  }
  expect(resolveServiceJobLines(invalid, choices).questions[0]).toContain(
    "exact currency",
  )
  expect(
    serviceJobRequestSchema.safeParse({ ...request, initialPaymentMinor: 100 })
      .success,
  ).toBe(false)
  expect(
    serviceJobRequestSchema.safeParse({
      lines: [{ ...request.lines[0], quantity: "0" }],
    }).success,
  ).toBe(false)
})
