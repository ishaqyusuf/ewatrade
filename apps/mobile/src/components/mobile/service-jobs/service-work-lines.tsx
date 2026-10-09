import { FormField } from "@/components/mobile/form-field"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { type ReactNode, useState } from "react"
import { workQueueStatus } from "../appearances/classic/service-jobs"
import { StatusPill } from "../green-till/kit"
import { ServiceAction } from "./service-action"
import {
  type WorkJob,
  actionLabel,
  actions,
  textLabel,
} from "./service-jobs-model"
import { useServiceAppearance } from "./use-service-appearance"

const PAGE_SIZE = 12
export function ServiceWorkLines({
  job,
  disabled,
  onTransition,
  onLayout,
  onPageChange,
}: {
  job: WorkJob
  disabled: boolean
  onTransition: (
    line: WorkJob["lines"][number],
    action: ReturnType<typeof actions>[number],
  ) => void
  onLayout: (y: number) => void
  onPageChange: () => void
}) {
  const { market, ServiceSection: Section } = useServiceAppearance()
  const [search, setSearch] = useState("")
  const [requestedPage, setPage] = useState(0)
  const query = search.trim().toLowerCase()
  const matches = query
    ? job.lines.filter((line) =>
        [
          line.catalogItemName,
          line.offeringName,
          line.variantName,
          textLabel(line.status),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : job.lines
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1),
  )
  const start = page * PAGE_SIZE
  const lines = matches.slice(start, start + PAGE_SIZE)
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  function move(next: number) {
    setPage(next)
    onPageChange()
  }
  return (
    <View onLayout={(event) => onLayout(event.nativeEvent.layout.y)}>
      <Frame count={job.lines.length} market={market} Section={Section}>
        {job.lines.length > PAGE_SIZE || search ? (
          <FormField
            variant={market ? "market" : "filled"}
            label="Find work line"
            leadingIcon="Search"
            maxLength={160}
            value={search}
            onChangeText={(value) => {
              setSearch(value)
              setPage(0)
            }}
            placeholder="Service, option or status"
          />
        ) : null}
        {!matches.length ? (
          <Text className={muted}>
            No matching work lines. Try another search.
          </Text>
        ) : null}
        <View className={market ? "border-y border-market-line" : "gap-2"}>
          {lines.map((line, index) => (
            <View
              key={line.id}
              className={
                market
                  ? `gap-4 py-4 ${index < lines.length - 1 ? "border-b border-market-line" : ""}`
                  : "gap-3 rounded-[20px] bg-card p-3.5 shadow-sm"
              }
            >
              <View className="flex-row flex-wrap items-start justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className={`${ink} font-bold`}>
                    {line.catalogItemName}
                  </Text>
                  <Text className={`${muted} text-xs`}>
                    {line.offeringName} · {line.allocatedQuantity}
                  </Text>
                </View>
                {market ? (
                  <StatusBadge label={textLabel(line.status)} tone="muted" />
                ) : (
                  <StatusPill
                    label={workQueueStatus(line.status.toLowerCase()).label}
                    tone={workQueueStatus(line.status.toLowerCase()).tone}
                  />
                )}
              </View>
              {line.authorizationStatus !== "AUTHORIZED" ? (
                <StatusBanner
                  icon="Lock"
                  message={`Work is waiting for ${textLabel(line.authorizationStatus)}.`}
                  tone="warning"
                />
              ) : null}
              {actions(line.status).length ? (
                <View className="gap-2">
                  {market ? (
                    <Text
                      className={`${muted} text-xs font-bold uppercase tracking-wider`}
                    >
                      Update status
                    </Text>
                  ) : null}
                  <View className="flex-row flex-wrap gap-2">
                    {actions(line.status).map((action, actionIndex) => (
                      <View className="min-w-[46%] flex-1" key={action}>
                        <ServiceAction
                          disabled={
                            disabled ||
                            line.authorizationStatus !== "AUTHORIZED"
                          }
                          onPress={() => onTransition(line, action)}
                          variant={
                            actionIndex === 0 &&
                            line.status !== "READY_FOR_HANDOFF"
                              ? "default"
                              : "outline"
                          }
                        >
                          {line.status === "READY_FOR_HANDOFF" &&
                          action === "in_progress"
                            ? "Reopen work"
                            : actionLabel(action)}
                        </ServiceAction>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {matches.length > PAGE_SIZE ? (
          <View className="gap-3">
            <Text
              accessibilityLiveRegion="polite"
              className={`${muted} text-xs`}
            >
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, matches.length)}{" "}
              of {matches.length} matching lines
            </Text>
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[44%] flex-1">
                <ServiceAction
                  variant="outline"
                  disabled={page === 0}
                  onPress={() => move(page - 1)}
                >
                  Previous
                </ServiceAction>
              </View>
              <View className="min-w-[44%] flex-1">
                <ServiceAction
                  variant="outline"
                  disabled={start + PAGE_SIZE >= matches.length}
                  onPress={() => move(page + 1)}
                >
                  Next
                </ServiceAction>
              </View>
            </View>
          </View>
        ) : null}
      </Frame>
    </View>
  )
}

function Frame({
  children,
  count,
  market,
  Section,
}: {
  children: ReactNode
  count: number
  market: boolean
  Section: ReturnType<typeof useServiceAppearance>["ServiceSection"]
}) {
  if (market)
    return (
      <Section title="Work lines" description={`${count} lines in this job`}>
        {children}
      </Section>
    )
  return (
    <View className="gap-2">
      <View className="mt-1 flex-row items-baseline justify-between px-0.5">
        <Text
          accessibilityRole="header"
          className="text-base font-extrabold tracking-tight text-foreground"
        >
          Work
        </Text>
        <Text className="text-xs font-bold text-muted-foreground">
          {count} line{count === 1 ? "" : "s"}
        </Text>
      </View>
      {children}
    </View>
  )
}
