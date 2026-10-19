import { describe, expect, test } from "bun:test"
import { createTRPCUntypedClient, loggerLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { shouldLogMobileTrpcOperation } from "./log-operation"

describe("mobile tRPC operation logging", () => {
  test.each(["development", "production"])(
    "assistant WhatsApp challenges and owned connections stay private in %s",
    async (environment) => {
      const logged: unknown[] = []
      const client = createTRPCUntypedClient({
        links: [
          loggerLink({
            enabled: (options) =>
              shouldLogMobileTrpcOperation(options, environment),
            logger: (options) => logged.push(options),
          }),
          () => () =>
            observable((observer) => {
              observer.next({
                result: {
                  data: { url: "https://wa.me/synthetic-private-challenge" },
                },
              })
              observer.complete()
            }),
        ],
      })
      await client.mutation("assistantChannels.createWhatsAppLink", {})
      await client.query("assistantChannels.whatsAppConnections")
      expect(logged).toHaveLength(0)
      expect(
        shouldLogMobileTrpcOperation(
          {
            direction: "down",
            path: "assistantChannels.confirmWhatsAppLink",
            result: new Error("private"),
          },
          environment,
        ),
      ).toBe(false)
    },
  )
  test.each(["development", "production"])(
    "customer message text and recipients stay out of request/error logs in %s",
    async (environment) => {
      const logged: unknown[] = []
      const client = createTRPCUntypedClient({
        links: [
          loggerLink({
            enabled: (options) =>
              shouldLogMobileTrpcOperation(options, environment),
            logger: (options) => logged.push(options),
          }),
          () => () =>
            observable((observer) =>
              observer.error(new Error("Request failed")),
            ),
        ],
      })
      await expect(
        client.mutation("customerMessages.prepareOpen", {
          body: "Synthetic private wording",
          orderId: "qa-order",
        }),
      ).rejects.toThrow()
      expect(logged).toHaveLength(0)
    },
  )
  test.each(["development", "production"])(
    "auth requests and errors travel without logging in %s",
    async (environment) => {
      const logged: unknown[] = []
      let requests = 0
      const client = createTRPCUntypedClient({
        links: [
          loggerLink({
            enabled: (options) =>
              shouldLogMobileTrpcOperation(options, environment),
            logger: (options) => {
              logged.push(options)
            },
          }),
          () => () =>
            observable((observer) => {
              requests += 1
              observer.error(new Error("Request failed"))
            }),
        ],
      })
      await expect(
        client.mutation("auth.signIn", { synthetic: true }),
      ).rejects.toThrow()
      expect(requests).toBe(1)
      expect(logged).toHaveLength(0)
    },
  )
  test("uses direct operation fields without breaking ordinary requests", async () => {
    const directions: string[] = []
    const client = createTRPCUntypedClient({
      links: [
        loggerLink({
          enabled: (options) =>
            shouldLogMobileTrpcOperation(options, "development"),
          logger: (options) => {
            directions.push(options.direction)
          },
        }),
        () => () =>
          observable((observer) => {
            observer.next({ result: { data: { eligible: true } } })
            observer.complete()
          }),
      ],
    })
    expect(await client.query("serviceCommerce.accountAgeStatus")).toEqual({
      eligible: true,
    })
    expect(directions).toEqual(["up", "down"])
  })
  test("missing paths and production successful responses stay private", () => {
    expect(
      shouldLogMobileTrpcOperation({ direction: "up" }, "development"),
    ).toBe(false)
    expect(
      shouldLogMobileTrpcOperation(
        { direction: "down", path: "account.profile", result: {} },
        "production",
      ),
    ).toBe(false)
  })
})
