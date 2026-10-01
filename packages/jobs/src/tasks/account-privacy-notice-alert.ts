import { logger, schedules } from "@trigger.dev/sdk/v3"
import { runAccountPrivacyNoticeAlert } from "../handlers/account-privacy-notice-alert"

export const accountPrivacyNoticeAlert = schedules.task({
  cron: "*/15 * * * *",
  id: "account-privacy.notice-alert",
  maxDuration: 120,
  run: async () => {
    const result = await runAccountPrivacyNoticeAlert()
    logger.info("Checked account privacy notice custody", result)
    return result
  },
})
