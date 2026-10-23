"use client"

import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"

export function useStorefrontParams() {
  const [params, setParams] = useQueryStates(
    {
      page: parseAsString.withDefault("home"),
      viewport: parseAsStringEnum(["desktop", "tablet", "mobile"]).withDefault(
        "desktop",
      ),
    },
    { history: "replace", shallow: true },
  )
  return { ...params, setParams }
}
