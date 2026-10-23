"use client"

import { SearchFilter } from "@/components/search-filter"
import {
  Button,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  Input,
} from "@ewatrade/ui"
import { useMemo, useState } from "react"
import type { IntakeLine, ServiceChoice } from "./service-intake-model"
import { formatPrice } from "./service-utils"

export function ServiceInlinePicker({
  offerings,
  lines,
  onChange,
  canQuote,
}: {
  offerings: ServiceChoice[]
  lines: IntakeLine[]
  onChange: (lines: IntakeLine[]) => void
  canQuote: boolean
}) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<string | null>(null)
  const [policy, setPolicy] = useState<string | null>(null)
  const groups = [...new Set(offerings.map((choice) => choice.catalogItemName))]
  const visible = useMemo(
    () =>
      offerings.filter(
        (choice) =>
          (!query ||
            choice.displayName
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())) &&
          (!group || choice.catalogItemName === group) &&
          (!policy || choice.pricingPolicy === policy),
      ),
    [offerings, query, group, policy],
  )
  function quantity(choice: ServiceChoice, value: string) {
    const existing = lines.find((line) => line.offeringId === choice.id)
    if (value === "0") {
      onChange(lines.filter((line) => line.offeringId !== choice.id))
      return
    }
    onChange(
      existing
        ? lines.map((line) =>
            line === existing ? { ...line, quantity: value } : line,
          )
        : [
            ...lines.filter((line) => line.offeringId || line.missingName),
            { offeringId: choice.id, quantity: value },
          ],
    )
  }
  return (
    <div className="grid min-w-0 gap-4">
      <SearchFilter
        value={query}
        onSearch={setQuery}
        placeholder="Search clothes, treatments or services"
        onClear={() => {
          setQuery("")
          setGroup(null)
          setPolicy(null)
        }}
        filters={[
          ...(group
            ? [{ id: "service", label: group, onRemove: () => setGroup(null) }]
            : []),
          ...(policy
            ? [
                {
                  id: "pricing",
                  label: policy === "fixed" ? "Fixed price" : "Quote required",
                  onRemove: () => setPolicy(null),
                },
              ]
            : []),
        ]}
        mobileFilters={{
          groups: [
            {
              id: "service",
              label: "Service",
              allLabel: "All services",
              options: groups.map((value) => ({ value, label: value })),
            },
            {
              id: "pricing",
              label: "Pricing",
              allLabel: "All pricing",
              options: [
                { value: "fixed", label: "Fixed price" },
                { value: "quote_required", label: "Quote required" },
              ],
            },
          ],
          values: {
            service: group ? [group] : [],
            pricing: policy ? [policy] : [],
          },
          onApply: (value) => {
            setGroup(value.service?.[0] ?? null)
            setPolicy(value.pricing?.[0] ?? null)
          },
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Pricing</DropdownMenuLabel>
          {["fixed", "quote_required"].map((value) => (
            <DropdownMenuCheckboxItem
              key={value}
              checked={policy === value}
              closeOnClick={false}
              onCheckedChange={(checked) => setPolicy(checked ? value : null)}
            >
              {value === "fixed" ? "Fixed price" : "Quote required"}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Service</DropdownMenuLabel>
          {groups.map((value) => (
            <DropdownMenuCheckboxItem
              key={value}
              checked={group === value}
              closeOnClick={false}
              onCheckedChange={(checked) => setGroup(checked ? value : null)}
            >
              {value}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </SearchFilter>
      <div
        className="max-h-[420px] overflow-auto overscroll-contain border-y border-border"
        aria-label="Available services"
      >
        {visible.map((choice) => {
          const line = lines.find((line) => line.offeringId === choice.id)
          const blocked = choice.pricingPolicy === "quote_required" && !canQuote
          return (
            <div
              key={choice.id}
              className="flex items-center gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{choice.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {choice.serviceWorkPolicy?.workPolicy === "TRACKED"
                    ? "Tracked work"
                    : "Charge only"}
                  {blocked ? " · A manager can prepare the quote" : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {formatPrice(choice.fixedPriceMinor, choice.currencyCode)}
              </span>
              {line ? (
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    type="button"
                    aria-label={`Remove one ${choice.displayName}`}
                    onClick={() =>
                      quantity(
                        choice,
                        String(Math.max(0, Number(line.quantity || 0) - 1)),
                      )
                    }
                  >
                    −
                  </Button>
                  <Input
                    className="w-16 text-center"
                    aria-label={`Quantity ${choice.displayName}`}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => quantity(choice, event.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    type="button"
                    aria-label={`Add one ${choice.displayName}`}
                    onClick={() =>
                      quantity(choice, String(Number(line.quantity || 0) + 1))
                    }
                  >
                    +
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={blocked}
                  onClick={() => quantity(choice, "1")}
                  aria-label={`Add ${choice.displayName}`}
                >
                  Add
                </Button>
              )}
            </div>
          )
        })}
        {!visible.length ? (
          <p className="p-6 text-sm text-muted-foreground">
            No matching services. Try another search or filter.
          </p>
        ) : null}
      </div>
    </div>
  )
}
