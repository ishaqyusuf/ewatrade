import { useQueryStates } from "nuqs"
import { createLoader, parseAsStringEnum } from "nuqs/server"

const customerChannelParams = {
  whatsapp: parseAsStringEnum([
    "failed",
    "invalid",
    "no-number",
    "select-number",
    "unavailable",
  ]),
}

export function useCustomerChannelParams() {
  const [params, setParams] = useQueryStates(customerChannelParams)
  return { ...params, setParams }
}

export const loadCustomerChannelParams = createLoader(customerChannelParams)
