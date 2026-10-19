import { expect, test } from "bun:test"
import {
  defaultChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"

test("server navigation completes before canonical claim or model context, keeping ID-only worker results", async () => {
  let canonicalCalls = 0
  const deps = {
    ...defaultChannelTurnDependencies(),
    enabled: () => true,
    control: async (id: string) => {
      expect(id).toBe("control-inbox-id")
      return { status: "completed" as const, nextIngressId: "next-control-id" }
    },
    claim: async () => {
      canonicalCalls++
      throw Error("Canonical model claim must not run")
    },
  }
  expect(await processAssistantChannelTurn("control-inbox-id", deps)).toEqual({
    status: "completed",
    nextIngressId: "next-control-id",
  })
  expect(canonicalCalls).toBe(0)
})

test("global disable stops controls too, while an ordinary turn continues through its existing claim", async () => {
  let controls = 0
  let claims = 0
  const deps = {
    ...defaultChannelTurnDependencies(),
    enabled: () => false,
    control: async () => {
      controls++
      return null
    },
    claim: async () => {
      claims++
      return { kind: "idle" as const, bindingId: undefined }
    },
  }
  expect(await processAssistantChannelTurn("id", deps)).toEqual({
    status: "disabled",
  })
  expect(controls).toBe(0)
  expect(claims).toBe(0)
  deps.enabled = () => true
  expect(await processAssistantChannelTurn("id", deps)).toEqual({
    status: "idle",
  })
  expect(controls).toBe(1)
  expect(claims).toBe(1)
})
