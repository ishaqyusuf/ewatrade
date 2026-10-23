"use client"

import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { Tabs, TabsList, TabsTrigger } from "@ewatrade/ui"

/** Jobs and Customer requests are two pages of Service jobs (managers see both). */
export function ServiceTabs() {
  const { tab, setParams } = useServiceWorkParams()
  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        void setParams({
          serviceTab: value === "requests" ? "requests" : "work",
          jobId: null,
          requestId: null,
          serviceSheet: null,
          jobStep: null,
        })
      }
    >
      <TabsList variant="line" aria-label="Services workspace">
        <TabsTrigger value="work">Service work</TabsTrigger>
        <TabsTrigger value="requests">Customer requests</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
