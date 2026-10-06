import { describe, expect, test } from "bun:test"
import { createRehearsalModel } from "@ewatrade/ai/rehearsal-model"
import { ToolLoopAgent, stepCountIs } from "ai"
import { buildSetupAssistantInstructions } from "./prompt"
import { respondSetupRehearsal } from "./rehearsal"
import { type SetupDraftEntityWrite, createSetupAssistantTools } from "./tools"

describe("setup agent loop", () => {
  test("rehearsal model drives draft tools through ToolLoopAgent without a provider", async () => {
    const staged: SetupDraftEntityWrite[] = []
    const context = {
      businessName: "Jawdah Poultry",
      storeName: "Main",
      businessProfile: null,
      operatingModel: null,
      currencyCode: "NGN",
      countryCode: "NG",
      existing: { catalogItems: 0, customers: 0 },
    }
    const agent = new ToolLoopAgent({
      model: createRehearsalModel((prompt) =>
        respondSetupRehearsal(
          prompt as Parameters<typeof respondSetupRehearsal>[0],
        ),
      ),
      instructions: buildSetupAssistantInstructions(context),
      tools: createSetupAssistantTools({
        context,
        sourceMessageId: "msg_1",
        readDraft: async () => [],
        writeEntities: async (entities) => {
          staged.push(...entities)
          return {
            revision: staged.length,
            changed: entities.map((e) => e.key),
            rejected: [],
          }
        },
        removeEntities: async () => ({ revision: 0 }),
      }),
      stopWhen: stepCountIs(8),
    })
    const result = await agent.stream({
      messages: [
        {
          role: "user",
          content: "Crate of eggs, 4500, 20 crates\nMama Ade owes me 15,000",
        },
      ],
    })
    const text = await result.text
    expect(staged.map((entity) => entity.key)).toEqual([
      "product:crate-of-eggs",
      "customer:mama-ade",
    ])
    expect(text).toContain("setup list")
    expect((await result.steps).length).toBe(3)
  })
})
