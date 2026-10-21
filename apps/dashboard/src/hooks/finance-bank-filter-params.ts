import { createLoader, parseAsString } from "nuqs/server"

export const financeBankFilterParams = {
  bankAccountId: parseAsString.withDefault(""),
  bankQuery: parseAsString.withDefault(""),
}
export const loadFinanceBankFilterParams = createLoader(financeBankFilterParams)
