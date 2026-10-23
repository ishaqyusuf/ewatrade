import type { WhatsAppFlowKind } from "./contracts"

type Component = Record<string, unknown>
type Field = {
  name: string
  component: Component
  boolean?: boolean
}
const text = (
  name: string,
  label: string,
  max: number,
  required = true,
  inputType = "text",
): Field => ({
  name,
  component: {
    type: "TextInput",
    name,
    label,
    required,
    "input-type": inputType,
    "max-chars": max,
  },
})
const choice = (
  name: string,
  label: string,
  values: Array<[string, string]>,
  required = true,
): Field => ({
  name,
  component: {
    type: "Dropdown",
    name,
    label,
    required,
    "data-source": values.map(([id, title]) => ({ id, title })),
  },
})
const options = (
  name: string,
  label: string,
  key: string,
  required = true,
): Field => ({
  name,
  component: {
    type: "Dropdown",
    name,
    label,
    required,
    "data-source": `\${data.${key}}`,
  },
})
const optIn = (name: string, label: string): Field => ({
  name,
  boolean: true,
  component: { type: "OptIn", name, label, required: true },
})
const paymentMethods: Array<[string, string]> = [
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
]
type Stage = {
  id: string
  title: string
  fields: Field[]
  components?: Component[]
}

function definition(
  kind: WhatsAppFlowKind,
  stages: Stage[],
  dynamicOptions: string[] = [],
  description = "Review this draft in chat before confirming.",
) {
  const dynamicData = Object.fromEntries(
    dynamicOptions.map((key) => [
      key,
      {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, title: { type: "string" } },
        },
        __example__: [{ id: "example-option", title: "Example option" }],
      },
    ]),
  )
  const allFields: Field[] = []
  return {
    version: "7.3",
    screens: stages.map((stage, index) => {
      const terminal = index === stages.length - 1
      const prior = [...allFields]
      allFields.push(...stage.fields)
      const values = Object.fromEntries(
        allFields.map((field) => [
          field.name,
          `\${${prior.some((previous) => previous.name === field.name) ? "data" : "form"}.${field.name}}`,
        ]),
      )
      const payload = terminal
        ? { form_kind: kind, form_version: "1", ...values }
        : {
            ...Object.fromEntries(
              dynamicOptions.map((key) => [key, `\${data.${key}}`]),
            ),
            scope_label: "${data.scope_label}",
            ...values,
          }
      return {
        id: stage.id,
        title: stage.title,
        ...(terminal ? { terminal: true, success: true } : {}),
        data: {
          scope_label: {
            type: "string",
            __example__: "Business · current scope",
          },
          ...dynamicData,
          ...Object.fromEntries(
            prior.map((field) => [
              field.name,
              {
                type: field.boolean ? "boolean" : "string",
                __example__: field.boolean ? true : "Example",
              },
            ]),
          ),
        },
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "Form",
              name: "form",
              children: [
                { type: "TextBody", text: "${data.scope_label}" },
                ...(stage.components ?? []),
                ...stage.fields.map((field) => field.component),
                { type: "TextCaption", text: description },
                {
                  type: "Footer",
                  label: terminal ? "Review draft" : "Continue",
                  "on-click-action": terminal
                    ? { name: "complete", payload }
                    : {
                        name: "navigate",
                        next: { type: "screen", name: stages[index + 1]?.id },
                        payload,
                      },
                },
              ],
            },
          ],
        },
      }
    }),
  }
}

/** Publishable source artifacts; no Flow ID, provider publication or launch implied. */
export const whatsAppFlowDefinitions = {
  registration: definition(
    "registration",
    [
      {
        id: "ABOUT_YOU",
        title: "About you",
        fields: [
          text("name", "Your name", 120),
          text("email", "Email", 254, true, "email"),
          choice("ageBand", "Age group", [
            ["AGE_13_TO_15", "13–15"],
            ["AGE_16_TO_17", "16–17"],
            ["ADULT", "18 or older"],
            ["UNDER_13", "Under 13"],
          ]),
        ],
        components: [
          {
            type: "TextBody",
            text: "You must be 13 or older. We will verify your email before creating an account or connecting a business.",
          },
        ],
      },
      {
        id: "BUSINESS",
        title: "Your business",
        fields: [
          text("businessName", "Business name", 120),
          options("countryCode", "Country", "countries"),
          options("currencyCode", "Currency", "currencies"),
        ],
      },
      {
        id: "CONSENT",
        title: "Terms and privacy",
        fields: [
          optIn("acceptedTerms", "I accept the Terms"),
          optIn(
            "acknowledgedPrivacyNotice",
            "I acknowledge the Privacy Notice",
          ),
        ],
        components: [
          {
            type: "TextBody",
            text: "Review the Terms and Privacy Notice linked in the chat before continuing. Completing this form does not connect your number or create your account.",
          },
        ],
      },
    ],
    ["countries", "currencies"],
    "Next: verify your email. Never send a password in chat.",
  ),
  sale: definition(
    "sale",
    [
      {
        id: "SALE_DETAILS",
        title: "Sale details",
        fields: [
          choice("customerChoice", "Customer", [
            ["walk_in", "Walk-in"],
            ["existing", "Existing Customer"],
            ["new", "New Customer"],
          ]),
          options("customerId", "Existing Customer", "customers", false),
          text("customerName", "New Customer name", 160, false),
          text("description", "What was sold?", 200),
        ],
      },
      {
        id: "SALE_PAYMENT",
        title: "Money received",
        fields: [
          text("received", "Amount received", 16, true, "text"),
          choice("method", "Payment method", paymentMethods),
          options("moneyAccountId", "Money account", "accounts"),
          choice("paymentStatus", "Payment status", [
            ["full", "Fully paid"],
            ["partial", "Partly paid"],
          ]),
          text("total", "Full sale total", 16, false, "text"),
        ],
      },
      {
        id: "SALE_AMOUNT_REVIEW",
        title: "Check the amounts",
        components: [
          { type: "TextSubheading", text: "Amount received" },
          { type: "TextBody", text: "${data.received}" },
          {
            type: "If",
            condition: "(${data.paymentStatus} == 'partial')",
            // biome-ignore lint/suspicious/noThenProperty: Meta Flow JSON names the conditional branch "then".
            then: [
              { type: "TextSubheading", text: "Full sale total" },
              { type: "TextBody", text: "${data.total}" },
            ],
            else: [{ type: "TextBody", text: "Paid in full" }],
          },
        ],
        fields: [optIn("checkedAmount", "I checked the full amounts above")],
      },
    ],
    ["customers", "accounts"],
    "Records money already received and what was sold. This does not move stock. 150 means 150, not 150,000. Review the full amount before confirming.",
  ),
  customer: definition("customer", [
    {
      id: "CUSTOMER",
      title: "New Customer",
      fields: [
        text("name", "Customer name", 160),
        text("phone", "Phone (optional)", 40, false, "phone"),
        text("email", "Email (optional)", 254, false, "email"),
      ],
    },
  ]),
  product: definition(
    "product",
    [
      {
        id: "PRODUCT",
        title: "Simple product",
        fields: [
          text("name", "Product name", 160),
          text("canonicalUnitName", "Inventory unit", 80),
          text("price", "Price (zero allowed)", 16, true, "text"),
          text("openingStock", "Opening stock", 19, false, "text"),
        ],
      },
    ],
    [],
    "Zero price and zero opening stock are allowed. Packs, variants and photos continue in the app.",
  ),
  expense: definition(
    "expense",
    [
      {
        id: "EXPENSE",
        title: "Record expense",
        fields: [
          text("amount", "Amount", 16, true, "text"),
          text("description", "Expense description", 200),
          options("bookId", "Book", "books"),
          options("expenseCategoryId", "Category", "categories"),
          choice("paymentStatus", "Payment status", [
            ["paid", "Already paid"],
            ["unpaid", "Unpaid"],
          ]),
          options("moneyAccountId", "Paid from account", "accounts", false),
          {
            name: "effectiveDate",
            component: {
              type: "DatePicker",
              name: "effectiveDate",
              label: "Date (optional)",
              required: false,
            },
          },
        ],
      },
      {
        id: "EXPENSE_AMOUNT_REVIEW",
        title: "Check the amount",
        components: [
          { type: "TextSubheading", text: "Expense amount" },
          { type: "TextBody", text: "${data.amount}" },
        ],
        fields: [optIn("checkedAmount", "I checked the full amount above")],
      },
    ],
    ["books", "categories", "accounts"],
    "Records an expense that happened. This never sends or transfers money. 150 means 150, not 150,000. Review the full amount before confirming.",
  ),
  stock_receive: definition(
    "stock_receive",
    [
      {
        id: "RECEIVE_STOCK",
        title: "Receive stock",
        fields: [
          options("balanceSourceId", "Exact stock item", "stockItems"),
          options("enteredInventoryUnitId", "Inventory unit", "inventoryUnits"),
          text("enteredQuantity", "Quantity received", 19, true, "text"),
          text("source", "Source/reference", 80),
          text("reason", "Reason", 500),
          text("supplierName", "Supplier (optional)", 160, false),
          text("unitCost", "Unit cost (optional)", 16, false, "text"),
        ],
      },
    ],
    ["stockItems", "inventoryUnits"],
    "Continue in the app to review and save. Stock only: no purchase or payment is created.",
  ),
} satisfies Record<WhatsAppFlowKind, ReturnType<typeof definition>>

export const whatsAppFlowFirstScreen: Record<WhatsAppFlowKind, string> = {
  registration: "ABOUT_YOU",
  sale: "SALE_DETAILS",
  customer: "CUSTOMER",
  product: "PRODUCT",
  expense: "EXPENSE",
  stock_receive: "RECEIVE_STOCK",
}
export const whatsAppFlowRequiredOptions: Record<
  WhatsAppFlowKind,
  readonly string[]
> = {
  registration: ["countries", "currencies"],
  sale: ["accounts"],
  customer: [],
  product: [],
  expense: ["books", "categories"],
  stock_receive: ["stockItems", "inventoryUnits"],
}
