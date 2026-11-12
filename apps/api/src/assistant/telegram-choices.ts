import {
  type TelegramInboxLease,
  resolveAssistantTelegramReplyChoice,
  stageAssistantTelegramOutbox,
} from "@ewatrade/db/assistant-telegram"
import type { GeneralContext } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"
import {
  TELEGRAM_CHOICE_PREFIX,
  type TelegramReplyOptions,
  renderTelegramChosenReply,
} from "./telegram-render"

/**
 * l-ambig in Telegram (Workshop telegram-system 02): the saved answer's choices are
 * inline buttons. A tap becomes that choice's saved text as the user's next message,
 * and the question is edited to mark the pick, with its callbacks removed.
 */

const choicePattern = new RegExp(`^${TELEGRAM_CHOICE_PREFIX}([1-3])$`)

export const telegramChoiceExpired =
  "That option expired or was replaced. Ask again, or type your answer here. Nothing was changed."

/**
 * Returns the saved choice text to run as a normal turn, or null when the tap no
 * longer matches the newest saved answer of this chat under the same authority.
 */
export async function pickTelegramChoice(
  ctx: GeneralContext,
  claim: { lease: TelegramInboxLease; inbox: { messageId: string } },
  data: string,
  options: TelegramReplyOptions,
) {
  const index = Number(choicePattern.exec(data)?.[1])
  if (!index) return null
  return inFreshGeneralTransaction(ctx, async (fresh) => {
    const choice = await resolveAssistantTelegramReplyChoice(
      fresh.db,
      claim.lease,
      { providerMessageId: claim.inbox.messageId, index },
    )
    if (!choice) return null
    const edited = renderTelegramChosenReply(choice.parts, choice.title, {
      ...options,
      messageId: choice.messageId,
    })
    // The mark is best effort: a failed edit never blocks the answer.
    if (edited)
      await stageAssistantTelegramOutbox(fresh.db, claim.lease, {
        editMessageId: claim.inbox.messageId,
        text: edited.text,
        html: true,
        ...(edited.buttons ? { buttons: edited.buttons } : {}),
      })
    return choice.text
  })
}
