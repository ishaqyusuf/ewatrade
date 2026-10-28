import { expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { type FetchEsque, createTRPCUntypedClient } from "@trpc/client"
import { isCustomerFundsOperation, publicPaymentLinks } from "./funds-transport"

type Sent = {
  paths: string[]
  url: string
  body: string
  init: Parameters<FetchEsque>[1]
}

function recordingClient() {
  const sent: Sent[] = []
  const recordingFetch: FetchEsque = async (input, init) => {
    const url = String(input)
    const paths = decodeURIComponent(
      url.slice("/api/trpc/".length).split("?")[0] ?? "",
    ).split(",")
    sent.push({ paths, url, body: String(init?.body), init })
    return Response.json(
      paths.map((path) => ({ result: { data: { json: { path } } } })),
    )
  }
  const client = createTRPCUntypedClient<AppRouter>({
    links: publicPaymentLinks(recordingFetch),
  })
  return { client, sent }
}

test("only the two exact funds procedures carry the session cookie", () => {
  expect(
    isCustomerFundsOperation({
      path: "businessBanking.customerFunds",
      type: "query",
    }),
  ).toBe(true)
  expect(
    isCustomerFundsOperation({
      path: "businessBanking.applyCustomerCredit",
      type: "mutation",
    }),
  ).toBe(true)
  for (const op of [
    { path: "businessBanking.customerFunds", type: "mutation" },
    { path: "businessBanking.applyCustomerCredit", type: "query" },
    { path: "businessBanking.customerFundsHistory", type: "query" },
    { path: "businessBanking.customerfunds", type: "query" },
    { path: "customerFunds", type: "query" },
    { path: "customerLedger.customerFunds", type: "query" },
    { path: " businessBanking.applyCustomerCredit", type: "mutation" },
    { path: "businessBanking.paymentLink", type: "query" },
    { path: "businessBanking.reportStatus", type: "query" },
    { path: "businessBanking.reportPayment", type: "mutation" },
    { path: "businessBanking.submitReport", type: "mutation" },
    { path: "businessBanking.nextPaymentAttempt", type: "mutation" },
  ]) {
    expect(isCustomerFundsOperation(op)).toBe(false)
  }
})

test("funds and public operations never share a batch or credentials", async () => {
  const { client, sent } = recordingClient()
  const caller = new AbortController()
  await Promise.all([
    client.query("businessBanking.paymentLink", { token: "link-secret" }),
    client.query(
      "businessBanking.customerFunds",
      { token: "link-secret" },
      { signal: caller.signal },
    ),
    client.query("businessBanking.reportStatus", { reportToken: "rt" }),
    client.mutation("businessBanking.reportPayment", { token: "link-secret" }),
    client.mutation("businessBanking.applyCustomerCredit", {
      token: "link-secret",
      clientCommandId: "cc_1",
    }),
    // Same name, wrong procedure type: stays on the public transport.
    client.mutation("businessBanking.customerFunds", { token: "link-secret" }),
  ])

  const byCredentials = (credentials: string) =>
    sent
      .filter((request) => request.init?.credentials === credentials)
      .map((request) => request.paths)
  expect(byCredentials("same-origin")).toEqual([
    ["businessBanking.customerFunds"],
    ["businessBanking.applyCustomerCredit"],
  ])
  expect(byCredentials("omit").flat().sort()).toEqual([
    "businessBanking.customerFunds",
    "businessBanking.paymentLink",
    "businessBanking.reportPayment",
    "businessBanking.reportStatus",
  ])
  expect(sent).toHaveLength(4)

  for (const request of sent) {
    expect(request.url.startsWith("/api/trpc/")).toBe(true)
    expect(request.url).not.toContain("link-secret")
    expect(request.body).toContain("link-secret")
    expect(request.init).toMatchObject({
      method: "POST",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
    })
    expect(request.init?.signal?.aborted).toBe(false)
    expect(request.body).not.toMatch(/userId|sessionId|customerId|accountId/)
  }

  const funds = sent.find(
    (request) => request.paths[0] === "businessBanking.customerFunds",
  )
  caller.abort()
  expect(funds?.init?.signal?.aborted).toBe(true)
})
