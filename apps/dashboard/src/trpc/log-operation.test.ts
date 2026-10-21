import { expect, test } from "bun:test"
import { createTRPCUntypedClient, loggerLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { shouldLogDashboardTrpcOperation } from "./log-operation"

test.each(["development", "production"])(
  "message request/error content remains unlogged in %s",
  async (environment) => {
    const logged: unknown[] = []
    const client = createTRPCUntypedClient({
      links: [
        loggerLink({
          enabled: (options) =>
            shouldLogDashboardTrpcOperation(options, environment),
          logger: (options) => logged.push(options),
        }),
        () => () =>
          observable((observer) =>
            observer.error(new Error("synthetic failure")),
          ),
      ],
    })
    await expect(
      client.mutation("customerMessages.prepareOpen", {
        body: "Synthetic private wording",
        orderId: "qa",
      }),
    ).rejects.toThrow()
    expect(logged).toHaveLength(0)
  },
)

test("ordinary development requests still log both directions; absent identity fails closed", async () => {
  const directions: string[] = []
  const client = createTRPCUntypedClient({
    links: [
      loggerLink({
        enabled: (options) =>
          shouldLogDashboardTrpcOperation(options, "development"),
        logger: (options) => directions.push(options.direction),
      }),
      () => () =>
        observable((observer) => {
          observer.next({ result: { data: true } })
          observer.complete()
        }),
    ],
  })
  expect(await client.query("tenant.current")).toBe(true)
  expect(directions).toEqual(["up", "down"])
  expect(
    shouldLogDashboardTrpcOperation(
      { direction: "down", result: Error("failure") },
      "development",
    ),
  ).toBe(false)
})

test.each(["development", "production"])(
  "assistant linking secrets and identity responses stay unlogged in %s",
  async (environment) => {
    const logged: unknown[] = []
    const client = createTRPCUntypedClient({
      links: [
        loggerLink({
          enabled: (options) =>
            shouldLogDashboardTrpcOperation(options, environment),
          logger: (options) => logged.push(options),
        }),
        () =>
          ({ op }) =>
            observable((observer) => {
              if (op.path === "assistantChannels.createWhatsAppLink") {
                observer.next({
                  result: {
                    data: {
                      url: "https://wa.me/12345678?text=private-link-proof",
                    },
                  },
                })
                observer.complete()
              } else observer.error(new Error("private-synthetic-error"))
            }),
      ],
    })
    await client.mutation("assistantChannels.createWhatsAppLink", {})
    await expect(
      client.mutation("assistantChannels.confirmWhatsAppLink", {
        linkId: "private",
        expectedRevision: 2,
      }),
    ).rejects.toThrow()
    await expect(
      client.query("assistantChannels.whatsAppConnections"),
    ).rejects.toThrow()
    expect(logged).toHaveLength(0)
  },
)

test.each(["development", "production"])(
  "disposable review locators and payloads stay unlogged in %s",
  async (environment) => {
    const logged: unknown[] = []
    const client = createTRPCUntypedClient({
      links: [
        loggerLink({
          enabled: (options) =>
            shouldLogDashboardTrpcOperation(options, environment),
          logger: (options) => logged.push(options),
        }),
        () => () =>
          observable((observer) => observer.error(Error("private-locator"))),
      ],
    })
    for (const method of ["reviewLink", "decideReviewLink", "editReviewLink"])
      await expect(
        client.mutation(`assistant.${method}`, { token: "private-locator" }),
      ).rejects.toThrow()
    expect(logged).toHaveLength(0)
  },
)
