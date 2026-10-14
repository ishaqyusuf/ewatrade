import { accountPrivacyEmailIntakeFailures } from "@ewatrade/utils/account-privacy-intake"
import { isTrustedClientIpHeaderConfigured } from "@ewatrade/utils/qa-network-source"
import { applyEwatradeSharedEnv } from "@ewatrade/utils/shared-env"

applyEwatradeSharedEnv()
const failures = accountPrivacyEmailIntakeFailures(process.env)
if (
  !isTrustedClientIpHeaderConfigured(
    process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER,
  )
)
  failures.push(
    "ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER must be cf-connecting-ip or x-real-ip, overwritten by the deployment's trusted proxy.",
  )
if (failures.length) {
  console.error("Account deletion intake configuration is not ready:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    "Account deletion intake configuration passed; live delivery, schema, operator access and request acceptance still require verification.",
  )
}
