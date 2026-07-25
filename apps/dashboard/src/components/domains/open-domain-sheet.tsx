"use client"

import {
  type DomainSheetMode,
  useDomainParams,
} from "@/hooks/use-domain-params"
import { Button } from "@ewatrade/ui"
import type { ComponentProps } from "react"

export function OpenDomainSheet({
  mode,
  ...props
}: ComponentProps<typeof Button> & { mode: DomainSheetMode }) {
  const { setParams } = useDomainParams()
  return <Button {...props} onClick={() => setParams({ domainMode: mode })} />
}
