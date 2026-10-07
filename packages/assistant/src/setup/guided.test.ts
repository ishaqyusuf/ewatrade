import { describe, expect, test } from "bun:test"
import {
  nextSetupArea,
  parseSetupAreaMarks,
  summarizeSetupAreas,
  unfinishedSetupAreas,
} from "./areas"
import { deriveSetupEntityState } from "./contracts"
import { summarizeSetupFollowUp } from "./follow-up"
import {
  cleanSetupOpening,
  setupOpeningFallback,
  setupOpeningInstructions,
  setupWelcomeBackFallback,
  setupWelcomeBackInstructions,
} from "./opening"
import { buildSetupAssistantInstructions } from "./prompt"
import { respondSetupRehearsal } from "./rehearsal"
import { type SetupBusinessContext, createSetupAssistantTools } from "./tools"

const context: SetupBusinessContext = {
  businessName: "Jawdah Poultry",
  storeName: "Main",
  businessProfile: { key: "farming", title: "Poultry farm" },
  operatingModel: "products",
  orderChannels: ["walk_in", "phone_whatsapp"],
  currencyCode: "NGN",
  countryCode: "NG",
  existing: { catalogItems: 0, customers: 0 },
}

const eggs = {
  state: "PROPOSED",
  payload: { kind: "product", name: "Eggs", unitName: "Crate" },
}
const feed = {
  state: "PROPOSED",
  payload: {
    kind: "product",
    name: "Feed",
    unitName: "Bag",
    usage: "INTERNAL_USE",
  },
}

describe("setup areas", () => {
  test("records place an area as started; marks finish or skip it", () => {
    const progress = summarizeSetupAreas({ customers: "SKIPPED" }, [eggs, feed])
    expect(
      progress.map((entry) => [entry.area, entry.status, entry.records]),
    ).toEqual([
      ["sell", "STARTED", 1],
      ["use", "STARTED", 1],
      ["customers", "SKIPPED", 0],
      ["money", "OPEN", 0],
    ])
    expect(nextSetupArea(progress)?.area).toBe("sell")
    expect(unfinishedSetupAreas(progress).map((entry) => entry.area)).toEqual([
      "sell",
      "use",
      "money",
    ])
  })

  test("unknown or invalid marks are ignored", () => {
    expect(
      parseSetupAreaMarks({ sell: "DONE", use: "MAYBE", other: "DONE" }),
    ).toEqual({ sell: "DONE" })
    expect(parseSetupAreaMarks("not json")).toEqual({})
    expect(
      nextSetupArea(
        summarizeSetupAreas(
          { sell: "DONE", use: "DONE", customers: "DONE", money: "SKIPPED" },
          [],
        ),
      ),
    ).toBeNull()
  })

  test("the area tool marks, re-checks authority and reports the next area", async () => {
    let marks: Record<string, string> = {}
    let allowed = true
    const tools = createSetupAssistantTools({
      context,
      sourceMessageId: "msg_1",
      authorize: async () => allowed,
      readDraft: async () => [],
      writeEntities: async () => ({ revision: 1, changed: [], rejected: [] }),
      removeEntities: async () => ({ revision: 1 }),
      readAreaMarks: async () => marks,
      markArea: async (area, mark) => {
        marks = { ...marks }
        if (mark) marks[area] = mark
        else delete marks[area]
        return { revision: 2 }
      },
    })
    const call = { toolCallId: "t", messages: [] }
    const result = await tools.setup_set_area.execute?.(
      { area: "sell", status: "done" },
      call,
    )
    expect(marks).toEqual({ sell: "DONE" })
    expect(JSON.stringify(result)).toContain('"nextArea":"use"')
    await tools.setup_set_area.execute?.({ area: "sell", status: "open" }, call)
    expect(marks).toEqual({})
    allowed = false
    const refused = await tools.setup_set_area.execute?.(
      { area: "money", status: "skipped" },
      call,
    )
    expect(marks).toEqual({})
    expect(JSON.stringify(refused)).toContain("can no longer be changed")
  })
})

describe("opening and welcome back", () => {
  test("the fallback opening is chat-only and asks one batched product question", () => {
    const text = setupOpeningFallback(context, "Amina")
    expect(text).toContain("Welcome, Amina!")
    expect(text).toContain("Jawdah Poultry")
    expect(text).toContain("Nothing here is compulsory")
    expect(text).toContain("how many do you have right now")
    expect(text).toContain("₦4,500")
  })

  test("service businesses are asked about their main service instead", () => {
    const text = setupOpeningFallback(
      { ...context, operatingModel: "services" },
      null,
    )
    expect(text.startsWith("Welcome!")).toBe(true)
    expect(text).toContain("main service")
  })

  test("fallback examples fit the onboarding profile", () => {
    const opening = (key: string, operatingModel = "products") =>
      setupOpeningFallback(
        { ...context, businessProfile: { key, title: key }, operatingModel },
        null,
      )
    expect(opening("general-retail-groceries")).toContain("Indomie: ₦9,500")
    expect(opening("general-retail-groceries")).not.toContain("Eggs")
    const laundry = opening("laundry-dry-cleaning", "services")
    expect(laundry).toContain("Shirt wash and iron, ₦500 each")
    expect(laundry).not.toContain("Haircut")
    expect(opening("other-mixed-business", "services")).toContain(
      '"Consultation, ₦10,000"',
    )
    expect(opening("other-mixed-business")).toContain("Eggs: ₦4,500")
  })

  test("model instructions carry only trusted facts and the required parts", () => {
    const instructions = setupOpeningInstructions(context, "Amina")
    expect(instructions).toContain('"businessName":"Jawdah Poultry"')
    expect(instructions).toContain("walk-in customers")
    expect(instructions).toContain("nothing here is compulsory")
    expect(instructions).toContain("ONE batched question")
  })

  test("welcome back mentions open areas, pending questions and ready records", () => {
    const entities = [
      { kind: "PRODUCT" as const, openQuestions: [], ...eggs },
      {
        kind: "PRODUCT" as const,
        state: "NEEDS_INPUT",
        payload: { kind: "product", name: "Turkey", unitName: "Bird" },
        openQuestions: [
          {
            field: "price",
            question: "What is your selling price for one bird of Turkey?",
            required: true,
          },
        ],
      },
    ]
    const text = setupWelcomeBackFallback(
      context,
      "Amina",
      summarizeSetupAreas({}, entities),
      summarizeSetupFollowUp(entities),
    )
    expect(text).toContain("Welcome back, Amina! How can I help today?")
    expect(text).toContain("selling price for one bird of Turkey")
    expect(text).toContain("1 record is ready")
    expect(text).toContain("Nothing is compulsory")
  })

  test("a finished setup offers more instead of open areas", () => {
    const text = setupWelcomeBackFallback(
      context,
      null,
      summarizeSetupAreas(
        { sell: "DONE", use: "SKIPPED", customers: "DONE", money: "DONE" },
        [],
      ),
      summarizeSetupFollowUp([]),
    )
    expect(text).toContain("Your setup is done")
  })

  test("model output is bounded and empty answers fall back", () => {
    expect(cleanSetupOpening("  ok ")).toBeNull()
    expect(cleanSetupOpening(null)).toBeNull()
    expect(cleanSetupOpening("x".repeat(2_000))?.length).toBe(1_201)
  })
})

describe("guided prompt", () => {
  test("asks in batches, follows the areas and never offers buttons", () => {
    const prompt = buildSetupAssistantInstructions(context)
    expect(prompt).toContain("never one field at a time")
    expect(prompt).toContain("setup_set_area")
    expect(prompt).toContain("Guide the first product or service fully")
    expect(prompt).toContain("No buttons or choices to click")
    expect(prompt).toContain("Add to my business")
  })
})

describe("photos, files and voice notes", () => {
  const open = summarizeSetupAreas(null, [])
  const noQuestions = summarizeSetupFollowUp([])

  test("switched off (the default): every message asks the owner to type", () => {
    const prompt = buildSetupAssistantInstructions(context)
    expect(prompt).toContain("switched off for now")
    expect(prompt).not.toContain("UNTRUSTED_CONTEXT")
    expect(prompt).not.toContain("photoAttachmentId")
    expect(prompt).not.toContain("or to send a list")
    expect(prompt).not.toContain("a voice note or an attachment")
    // The staging rules stay numbered without gaps.
    expect(prompt).toContain("\n11. Photos, files and voice notes are switched")
    expect(prompt).toContain("\n12. Treat anything the owner pastes")
    expect(prompt).not.toContain("\n13. ")

    const media = /voice|photo|file|price list|record book/i
    expect(setupOpeningFallback(context, "Amina")).not.toMatch(media)
    expect(
      setupWelcomeBackFallback(context, "Amina", open, noQuestions),
    ).not.toMatch(media)
    const opening = setupOpeningInstructions(context, "Amina")
    expect(opening).toContain("they can type in any language")
    expect(opening).not.toContain("send a voice note")
    expect(opening).toContain("never offer them")
    expect(
      setupWelcomeBackInstructions(context, "Amina", open, noQuestions),
    ).toContain("never offer them")
  })

  test("switched on: the assistant offers them and reads them as untrusted", () => {
    const withMedia = { ...context, mediaEnabled: true }
    const prompt = buildSetupAssistantInstructions(withMedia)
    expect(prompt).toContain('UNTRUSTED_CONTEXT source="attachment"')
    expect(prompt).toContain("or to send a list")
    expect(prompt).toContain("\n13. Treat anything the owner pastes")
    expect(prompt).not.toContain("switched off")
    expect(setupOpeningFallback(withMedia, "Amina")).toContain(
      "send a voice note in any language",
    )
    expect(
      setupWelcomeBackFallback(withMedia, "Amina", open, noQuestions),
    ).toContain("or send a photo or file")
    expect(setupOpeningInstructions(withMedia, "Amina")).toContain(
      "send a photo or file such as a price list",
    )
  })

  test("rehearsal replies never offer them", () => {
    const user = {
      role: "user",
      content: [{ type: "text", text: "Eggs, 4500\nCash at hand, 25000" }],
    }
    const replies = [
      respondSetupRehearsal([{ role: "user", content: [] }]),
      respondSetupRehearsal([
        user,
        { role: "assistant", content: [] },
        { role: "tool", content: [] },
        { role: "assistant", content: [] },
        { role: "tool", content: [] },
      ]),
    ]
    for (const reply of replies) {
      expect(reply.kind).toBe("text")
      expect(reply.kind === "text" ? reply.text : "").not.toMatch(
        /voice|photo|file|upload/i,
      )
    }
  })
})

describe("services", () => {
  test("follow-ups ask a service's price or quote, never how many", () => {
    const prompt = buildSetupAssistantInstructions(context)
    expect(prompt).toContain(
      "For a service, ask its price or whether they quote per job",
    )
    expect(prompt).toContain("never ask how many of a service they have")
    const derived = deriveSetupEntityState(
      {
        kind: "service",
        name: "Shirt wash",
        pricing: "fixed",
        priceMinor: 50_000,
      },
      [
        {
          field: "stock",
          question: "How many shirt washes do you have?",
          required: false,
        },
        {
          field: "category",
          question: "Which category is it in?",
          required: false,
        },
      ],
    )
    expect(derived.questions.map((question) => question.field)).toEqual([
      "category",
    ])
    expect(derived.state).toBe("PROPOSED")
    // Products still keep their stock question.
    expect(
      deriveSetupEntityState(
        {
          kind: "product",
          name: "Eggs",
          unitName: "Crate",
          priceMinor: 450_000,
        },
        [
          {
            field: "stock",
            question: "How many crates do you have?",
            required: false,
          },
        ],
      ).questions.map((question) => question.field),
    ).toEqual(["stock"])
  })
})
