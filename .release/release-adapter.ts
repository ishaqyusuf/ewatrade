import {
  runConsumerReleaseCheck,
  type ConsumerReleaseContext,
} from "./toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/consumer"
import { createEwaTradeProviderBindings } from "./ewatrade-provider-bundle"

export async function checkRelease(context: ConsumerReleaseContext) {
  return runConsumerReleaseCheck(
    context,
    createEwaTradeProviderBindings(context),
  )
}
