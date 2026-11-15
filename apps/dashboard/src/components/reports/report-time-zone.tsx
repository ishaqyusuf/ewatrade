"use client"

import { type ReactNode, createContext, useContext } from "react"

const ReportTimeZoneContext = createContext("UTC")

/**
 * The business time zone report periods use, so "Today" starts at local
 * midnight. Finance reports leave it unset: book dates are UTC days.
 */
export function ReportTimeZoneProvider({
  children,
  timeZone,
}: {
  children: ReactNode
  timeZone: string
}) {
  return (
    <ReportTimeZoneContext.Provider value={timeZone}>
      {children}
    </ReportTimeZoneContext.Provider>
  )
}

export function useReportTimeZone() {
  return useContext(ReportTimeZoneContext)
}
