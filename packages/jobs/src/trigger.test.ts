import { afterEach, describe, expect, mock, test } from "bun:test"
import { taskContext } from "@trigger.dev/core/v3"

const configured: unknown[] = []
const triggered: string[] = []
mock.module("@trigger.dev/sdk/v3", () => ({
  configure: (options: unknown) => configured.push(options),
  idempotencyKeys: { create: async (key: string) => key },
  tasks: {
    trigger: async (id: string) => {
      triggered.push(id)
    },
  },
}))
const { triggerJob } = await import("./trigger")

const noop = async () => {}

describe("triggerJob", () => {
  afterEach(() => {
    taskContext.setGlobalTaskContext(undefined as never)
    configured.length = 0
    triggered.length = 0
  })

  test("inside a run it keeps the run's own credentials", async () => {
    process.env.EWATRADE_TRIGGER_SECRET_KEY = "tr_prod_app_key"
    taskContext.setGlobalTaskContext({ ctx: {}, worker: {} } as never)
    await triggerJob("assistant.whatsapp.turn", noop, { ingressId: "i1" })
    // A process-global configure() would move every later trigger in this
    // run (other cadence steps too) onto the app key.
    expect(configured).toEqual([])
    expect(triggered).toEqual(["assistant.whatsapp.turn"])
  })

  test("outside a run it authenticates with the app key", async () => {
    process.env.EWATRADE_TRIGGER_SECRET_KEY = "tr_prod_app_key_2"
    await triggerJob("assistant.whatsapp.turn", noop, { ingressId: "i1" })
    expect(configured).toEqual([{ accessToken: "tr_prod_app_key_2" }])
    expect(triggered).toEqual(["assistant.whatsapp.turn"])
  })
})
