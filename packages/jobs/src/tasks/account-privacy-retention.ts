import { task } from "@trigger.dev/sdk/v3"
import { accountPrivacyRetentionHandler } from "../handlers/account-privacy-retention"

export const accountPrivacyRetention = task({
  id: "account-privacy.retention",
  maxDuration: 900,
  run: accountPrivacyRetentionHandler,
})
