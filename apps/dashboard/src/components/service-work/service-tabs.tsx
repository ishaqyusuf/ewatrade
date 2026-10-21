"use client"

import { SecondaryMenu } from "@/components/secondary-menu"

const SERVICE_PAGES = [
  { path: "/services", label: "Jobs" },
  { path: "/services/requests", label: "Customer requests" },
]

/** Jobs and Customer requests are two pages of Service jobs (managers see both). */
export function ServiceTabs() {
  return <SecondaryMenu items={SERVICE_PAGES} label="Service jobs" />
}
