import { z } from "zod"
import {
  type SetupEntityKind,
  type SetupOpenQuestion,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "./contracts"

export type SetupFollowUpEntity = {
  kind: SetupEntityKind
  state: string
  payload: unknown
  openQuestions: unknown
}

export type SetupFollowUp = {
  /** Records the owner still has to finish, confirm or retry. */
  open: number
  needsDetails: number
  readyToConfirm: number
  waitingToAdd: number
  failed: number
  /** At most two short questions, most important first. */
  questions: string[]
}

const MAX_QUESTIONS = 2
const MAX_NAMES = 3

const questionsSchema = z.array(setupOpenQuestionSchema).catch([])

function listJoin(items: string[]) {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

function nameList(names: string[]) {
  if (names.length <= MAX_NAMES + 1) return listJoin(names)
  const rest = names.length - MAX_NAMES
  return listJoin([...names.slice(0, MAX_NAMES), `${rest} more`])
}

type Missing = { name: string; label: string; question: SetupOpenQuestion }

/**
 * Deterministic follow-up for the setup list: what is still open and the next
 * one or two questions to ask, grouped so several records missing the same
 * fact share one question. Required facts (prices) come before optional ones.
 */
export function summarizeSetupFollowUp(
  entities: SetupFollowUpEntity[],
): SetupFollowUp {
  const counts = {
    needsDetails: 0,
    readyToConfirm: 0,
    waitingToAdd: 0,
    failed: 0,
  }
  const required = new Map<string, Missing[]>()
  const missingStock: string[] = []
  const missingBalance: string[] = []

  for (const entity of entities) {
    if (entity.state === "NEEDS_INPUT") counts.needsDetails += 1
    else if (entity.state === "PROPOSED") counts.readyToConfirm += 1
    else if (entity.state === "CONFIRMED") counts.waitingToAdd += 1
    else if (entity.state === "FAILED") counts.failed += 1
    else continue

    const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
    if (!parsed.success) continue
    const payload = parsed.data
    const question = questionsSchema
      .parse(entity.openQuestions)
      .find((entry) => entry.required)
    if (entity.state === "NEEDS_INPUT" && question) {
      const group = required.get(question.field) ?? []
      group.push({
        name: payload.name,
        label:
          payload.kind === "product"
            ? `${payload.name} (per ${payload.unitName.toLowerCase()})`
            : payload.name,
        question,
      })
      required.set(question.field, group)
    } else if (
      payload.kind === "product" &&
      payload.openingStock === undefined &&
      !payload.options?.length &&
      entity.state !== "FAILED"
    ) {
      missingStock.push(payload.name)
    } else if (
      payload.kind === "money_account" &&
      payload.openingBalanceMinor === undefined &&
      entity.state !== "FAILED"
    ) {
      missingBalance.push(payload.name)
    }
  }

  const questions: string[] = []
  for (const [field, group] of required) {
    if (questions.length >= MAX_QUESTIONS) break
    const [first] = group
    if (!first) continue
    if (group.length === 1) questions.push(first.question.question)
    else if (field === "price")
      questions.push(
        `What is your selling price for ${nameList(group.map((entry) => entry.label))}?`,
      )
    else
      questions.push(
        `${first.question.question} The same goes for ${nameList(group.slice(1).map((entry) => entry.name))}.`,
      )
  }
  if (questions.length < MAX_QUESTIONS && missingStock.length > 0)
    questions.push(
      missingStock.length === 1
        ? `How many ${missingStock[0]} do you have right now?`
        : `How many of ${nameList(missingStock)} do you have right now?`,
    )

  if (questions.length < MAX_QUESTIONS && missingBalance.length > 0)
    questions.push(
      `How much money is in ${nameList(missingBalance)} right now?`,
    )

  return {
    open:
      counts.needsDetails +
      counts.readyToConfirm +
      counts.waitingToAdd +
      counts.failed,
    ...counts,
    questions,
  }
}
