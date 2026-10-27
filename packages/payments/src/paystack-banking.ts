/** Server-only Paystack transport. Domain authorization and durable effect claims
 * belong to the caller; this adapter never retries a write. */
export class PaystackBankingError extends Error {
  constructor(
    readonly outcome: "REJECTED" | "UNKNOWN",
    readonly operation: string,
  ) {
    super(
      outcome === "UNKNOWN"
        ? "The provider outcome is unknown. Reconcile before trying again."
        : "Paystack could not complete this operation.",
    )
    this.name = "PaystackBankingError"
  }
}

type Json = Record<string, unknown>
const object = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid provider object")
  return value as Json
}
const string = (value: unknown) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Invalid provider string")
  return value.trim()
}
const identity = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : string(value)
const minor = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid provider amount")
  return value
}
const nonempty = (value: string, label: string) => {
  if (!value.trim()) throw new Error(`Enter ${label}.`)
  return value.trim()
}

export type PaystackReceivingAccount = {
  providerAccountId: string
  customerCode: string
  accountNumber: string
  accountName: string
  bankName: string
  bankSlug: string
  active: boolean
  assigned: boolean
  currencyCode: "NGN"
}
export type PaystackTransfer = {
  reference: string
  transferCode: string
  status: string
  amountMinor: number
  currencyCode: string
  recipientCode: string
}

function receivingAccount(data: unknown): PaystackReceivingAccount {
  const row = object(data)
  const bank = object(row.bank)
  const customer = object(row.customer)
  const accountNumber = string(row.account_number)
  if (!/^\d{10}$/.test(accountNumber) || row.currency !== "NGN")
    throw new Error("Invalid Nigerian account")
  if (typeof row.active !== "boolean" || typeof row.assigned !== "boolean")
    throw new Error("Missing assignment proof")
  return {
    providerAccountId: identity(row.id),
    customerCode: string(customer.customer_code),
    accountNumber,
    accountName: string(row.account_name),
    bankName: string(bank.name),
    bankSlug: string(bank.slug),
    active: row.active,
    assigned: row.assigned,
    currencyCode: "NGN",
  }
}
function transfer(data: unknown): PaystackTransfer {
  const row = object(data)
  const recipient =
    typeof row.recipient === "string"
      ? row.recipient
      : object(row.recipient).recipient_code
  return {
    reference: string(row.reference),
    transferCode: string(row.transfer_code),
    status: string(row.status),
    amountMinor: minor(row.amount),
    currencyCode: string(row.currency),
    recipientCode: string(recipient),
  }
}

export class PaystackBankingProvider {
  readonly #fetch: typeof fetch
  readonly #secretKey: string

  constructor(input: { secretKey: string; fetch?: typeof fetch }) {
    this.#secretKey = nonempty(input.secretKey, "a Paystack secret key")
    this.#fetch = input.fetch ?? fetch
  }

  async #request<T>(
    path: string,
    parse: (data: unknown) => T,
    body?: Json,
  ): Promise<T> {
    let response: Response
    try {
      response = await this.#fetch(`https://api.paystack.co${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.#secretKey}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      })
    } catch {
      throw new PaystackBankingError("UNKNOWN", path.split("?")[0] ?? "/")
    }
    let payload: Json
    try {
      payload = object(await response.json())
    } catch {
      throw new PaystackBankingError("UNKNOWN", path.split("?")[0] ?? "/")
    }
    if (!response.ok || payload.status !== true) {
      const unknown =
        response.status >= 500 ||
        [408, 409, 425, 429].includes(response.status) ||
        /duplicate|already exist/i.test(String(payload.message ?? ""))
      throw new PaystackBankingError(
        unknown ? "UNKNOWN" : "REJECTED",
        path.split("?")[0] ?? "/",
      )
    }
    try {
      return parse(payload.data)
    } catch {
      throw new PaystackBankingError("UNKNOWN", path.split("?")[0] ?? "/")
    }
  }

  createCustomer(input: {
    email: string
    firstName: string
    lastName: string
    phone?: string
  }) {
    const email = input.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Enter a valid email address.")
    return this.#request(
      "/customer",
      (data) => ({ customerCode: string(object(data).customer_code) }),
      {
        email,
        first_name: nonempty(input.firstName, "first name"),
        last_name: nonempty(input.lastName, "last name"),
        ...(input.phone ? { phone: input.phone } : {}),
      },
    )
  }

  receivingAccountProviders() {
    return this.#request("/dedicated_account/available_providers", (data) => {
      if (!Array.isArray(data)) throw new Error("Invalid bank providers")
      return data.map((item) => {
        const row = object(item)
        return { name: string(row.bank_name), slug: string(row.bank_slug) }
      })
    })
  }

  createReceivingAccount(input: { customerCode: string; bankSlug: string }) {
    return this.#request("/dedicated_account", receivingAccount, {
      customer: nonempty(input.customerCode, "the provider customer"),
      preferred_bank: nonempty(input.bankSlug, "a supported bank"),
    }).then((account) => {
      if (
        account.customerCode !== input.customerCode ||
        account.bankSlug !== input.bankSlug
      )
        throw new PaystackBankingError("UNKNOWN", "/dedicated_account")
      return account
    })
  }

  fetchReceivingAccount(providerAccountId: string) {
    return this.#request(
      `/dedicated_account/${encodeURIComponent(providerAccountId)}`,
      receivingAccount,
    )
  }

  resolveAccount(input: { accountNumber: string; bankCode: string }) {
    if (
      !/^\d{10}$/.test(input.accountNumber) ||
      !/^\d{3,9}$/.test(input.bankCode)
    )
      throw new Error("Enter a Nigerian bank and ten-digit account number.")
    const query = new URLSearchParams({
      account_number: input.accountNumber,
      bank_code: input.bankCode,
    })
    return this.#request(`/bank/resolve?${query}`, (data) => {
      const row = object(data)
      if (row.account_number !== input.accountNumber)
        throw new Error("Resolution mismatch")
      return { ...input, accountName: string(row.account_name) }
    })
  }

  createRecipient(input: {
    accountNumber: string
    bankCode: string
    confirmedAccountName: string
  }) {
    if (
      !/^\d{10}$/.test(input.accountNumber) ||
      !/^\d{3,9}$/.test(input.bankCode)
    )
      throw new Error("Enter a Nigerian bank and ten-digit account number.")
    return this.#request(
      "/transferrecipient",
      (data) => {
        const row = object(data)
        const details = object(row.details)
        if (
          details.account_number !== input.accountNumber ||
          details.bank_code !== input.bankCode ||
          string(details.account_name) !== input.confirmedAccountName.trim() ||
          row.currency !== "NGN" ||
          row.active !== true
        )
          throw new Error("Recipient mismatch")
        return {
          recipientCode: string(row.recipient_code),
          accountName: string(details.account_name),
          bankCode: input.bankCode,
          bankName: string(details.bank_name),
          accountSuffix: input.accountNumber.slice(-4),
          currencyCode: "NGN" as const,
        }
      },
      {
        type: "nuban",
        name: nonempty(
          input.confirmedAccountName,
          "the confirmed account name",
        ),
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: "NGN",
      },
    )
  }

  sendTransfer(input: {
    amountMinor: number
    recipientCode: string
    reference: string
    reason: string
  }) {
    if (
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor <= 0 ||
      !/^[a-z0-9_-]{16,50}$/.test(input.reference) ||
      !/^RCP_[a-zA-Z0-9]+$/.test(input.recipientCode)
    )
      throw new Error("Invalid transfer amount, recipient or reference.")
    return this.#request("/transfer", transfer, {
      source: "balance",
      amount: input.amountMinor,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
      currency: "NGN",
    }).then((result) => {
      if (
        result.reference !== input.reference ||
        result.amountMinor !== input.amountMinor ||
        result.recipientCode !== input.recipientCode ||
        result.currencyCode !== "NGN"
      )
        throw new PaystackBankingError("UNKNOWN", "/transfer")
      return result
    })
  }

  verifyTransfer(reference: string) {
    return this.#request(
      `/transfer/verify/${encodeURIComponent(reference)}`,
      transfer,
    ).then((result) => {
      if (result.reference !== reference)
        throw new PaystackBankingError("UNKNOWN", "/transfer/verify")
      return result
    })
  }
}
