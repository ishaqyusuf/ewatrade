"use client"

import { SERVICE_STAGE_TABS } from "@/components/service-work/service-utils"
import { getServiceWorkStageCountsInput } from "@/hooks/use-service-work-filter-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Tabs, TabsList, TabsTrigger } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

/** Open · Not started · In progress · Stuck · Ready for customer · Handed over, with counts. */
export function ServiceStageTabs({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const { filter, setParams } = useServiceWorkParams()
  const stage = filter.stage ?? "open"
  const counts = useQuery(
    trpc.services.queueStageCounts.queryOptions(
      { ...getServiceWorkStageCountsInput(filter), storeId },
      { retry: false },
    ),
  )
  return (
    <Tabs
      value={stage}
      onValueChange={(value) =>
        void setParams({
          serviceStage:
            value === "open" ? null : (value as Exclude<typeof stage, "open">),
        })
      }
    >
      <TabsList
        variant="line"
        aria-label="Show jobs"
        className="max-w-full justify-start overflow-x-auto pb-1.5"
      >
        {SERVICE_STAGE_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {counts.data ? (
              <span className="rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-foreground">
                {counts.data[tab.value]}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
