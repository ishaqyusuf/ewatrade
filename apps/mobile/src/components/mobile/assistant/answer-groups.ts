import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"

export type AnswerGroup = { head: GeneralAnswer; rows: GeneralAnswer[] }

/** A page header card: no record of its own to open and no structured rows. */
function isPageHead(answer: GeneralAnswer) {
  return !answer.target && !answer.records && !answer.accounts
}

/** One record of a read (an order, item or customer) that opens on its own. */
function isRecordRow(answer: GeneralAnswer, head: GeneralAnswer) {
  return (
    Boolean(answer.target) &&
    !answer.records &&
    !answer.accounts &&
    !answer.catalogCreate &&
    !answer.serviceDraft &&
    !answer.handoff &&
    !answer.chatChoices?.length &&
    answer.scope === head.scope &&
    answer.asOf === head.asOf
  )
}

/**
 * A read's page header and the records under it become one list card, so ten
 * orders are ten short rows, not ten cards. Anything else stays its own card.
 */
export function groupAnswerRows(answers: GeneralAnswer[]): AnswerGroup[] {
  const groups: AnswerGroup[] = []
  for (const answer of answers) {
    const last = groups.at(-1)
    if (last && isPageHead(last.head) && isRecordRow(answer, last.head))
      last.rows.push(answer)
    else groups.push({ head: answer, rows: [] })
  }
  return groups
}

/**
 * A card's small "where" line without the business or Store name: the
 * screen header already says which business this is.
 */
export function answerScopeLine(
  scope: string,
  names: Array<string | null | undefined>,
) {
  const known = new Set(
    [...names, "Current business"]
      .filter((name): name is string => Boolean(name?.trim()))
      .map((name) => name.trim().toLowerCase()),
  )
  return scope
    .split(" · ")
    .filter((part) => !known.has(part.trim().toLowerCase()))
    .join(" · ")
}
