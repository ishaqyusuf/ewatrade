import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  useComboboxAnchor,
} from "@ewatrade/ui"
import { useId } from "react"

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
}: {
  draft: EarlyAccessContextDraft
  onChange: (draft: EarlyAccessContextDraft) => void
}) {
  const id = useId()
  const setupAnchor = useComboboxAnchor()
  return (
    <>
      <FieldGroup className="lead-capture-row grid md:grid-cols-2">
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
          <Field key={field}>
            <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
            <SelectRoot
              required
              name={field}
              value={draft[field] || null}
              items={choices.map(([value, label]) => ({ value, label }))}
              onValueChange={(value) =>
                onChange({ ...draft, [field]: value ?? "" })
              }
            >
              <SelectTrigger id={`${id}-${field}`} appearance="form">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {choices.map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </SelectRoot>
          </Field>
        ))}
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-setupNeeds`}>
          What should setup cover?
        </FieldLabel>
        <Combobox
          multiple
          autoHighlight
          required
          name="setupNeeds"
          value={draft.setupNeeds}
          items={setupNeedOptions}
          itemToStringLabel={(value) => {
            const option = setupNeedOptions.find((option) => option === value)
            return option ? needLabels[option] : value
          }}
          onValueChange={(setupNeeds) => onChange({ ...draft, setupNeeds })}
        >
          <ComboboxChips ref={setupAnchor} appearance="form">
            <ComboboxValue>
              {(values: (typeof setupNeedOptions)[number][]) =>
                values.map((value) => (
                  <ComboboxChip
                    key={value}
                    removeLabel={`Remove ${needLabels[value]}`}
                  >
                    {needLabels[value]}
                  </ComboboxChip>
                ))
              }
            </ComboboxValue>
            <ComboboxChipsInput
              id={`${id}-setupNeeds`}
              placeholder="Select setup areas"
              aria-describedby={`${id}-setupNeeds-hint`}
            />
          </ComboboxChips>
          <ComboboxContent anchor={setupAnchor}>
            <ComboboxEmpty>No setup areas found.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxGroup>
                <ComboboxCollection>
                  {(value: (typeof setupNeedOptions)[number]) => (
                    <ComboboxItem key={value} value={value}>
                      {needLabels[value]}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription id={`${id}-setupNeeds-hint`}>
          Select at least one area. You can choose more than one.
        </FieldDescription>
      </Field>
    </>
  )
}
