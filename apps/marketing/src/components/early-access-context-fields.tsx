import { setupNeedOptions } from "@/lib/lead-capture"

export type EarlyAccessContextDraft = {
  businessSize: string
  recordSystem: string
  launchTimeline: string
  setupNeeds: string[]
}

const sizeChoices = [
  ["solo", "Just me"],
  ["2_to_10", "2–10 people"],
  ["11_to_50", "11–50 people"],
  ["51_plus", "51 or more people"],
]
const recordChoices = [
  ["paper", "Paper or manual records"],
  ["spreadsheets", "Spreadsheets"],
  ["software", "Existing software"],
  ["mixed", "A mix of systems"],
  ["starting", "Starting a new business"],
]
const timelineChoices = [
  ["as_soon_as_possible", "As soon as possible"],
  ["within_30_days", "Within 30 days"],
  ["within_3_months", "Within 1–3 months"],
  ["exploring", "Later or still exploring"],
]
const needLabels: Record<(typeof setupNeedOptions)[number], string> = {
  catalog: "Catalog and products",
  inventory: "Stock and inventory",
  sales: "Sales and orders",
  services: "Service work",
  customers: "Customer communication",
  finance: "Business finances",
  storefront: "Storefront and online ordering",
}

export function EarlyAccessContextFields({
  draft,
  onChange,
  inputClassName,
}: {
  draft: EarlyAccessContextDraft
  onChange: (draft: EarlyAccessContextDraft) => void
  inputClassName: string
}) {
  return (
    <>
      <div className="lead-capture-row grid gap-4 md:grid-cols-2">
        {(
          [
            ["businessSize", "Current business size", sizeChoices],
            ["recordSystem", "How are records managed today?", recordChoices],
            [
              "launchTimeline",
              "When do you want to start setup?",
              timelineChoices,
            ],
          ] as const
        ).map(([field, label, choices]) => (
          <label
            key={field}
            className="lead-capture-field space-y-2 text-sm text-foreground"
          >
            <span>{label}</span>
            <select
              required
              name={field}
              value={draft[field]}
              className={inputClassName}
              onChange={(event) =>
                onChange({ ...draft, [field]: event.target.value })
              }
            >
              <option value="">Select an option</option>
              {choices.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <fieldset className="lead-capture-field space-y-2 text-sm text-foreground">
        <legend>What should setup cover?</legend>
        <p className="text-xs text-muted-foreground">
          Select at least one area.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {setupNeedOptions.map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="setupNeeds"
                value={value}
                checked={draft.setupNeeds.includes(value)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    setupNeeds: event.target.checked
                      ? [...draft.setupNeeds, value]
                      : draft.setupNeeds.filter((need) => need !== value),
                  })
                }
              />
              <span>{needLabels[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}
