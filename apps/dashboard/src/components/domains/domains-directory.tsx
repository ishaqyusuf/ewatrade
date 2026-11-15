"use client"

import {
  SettingsHeader,
  SettingsPage,
} from "@/components/settings/settings-page"
import { useDomainParams } from "@/hooks/use-domain-params"
import { Button } from "@ewatrade/ui"
import { Suspense } from "react"
import { DomainList, DomainListSkeleton } from "./domain-list"

/** Settings → Domains: connect your own address (modal) or buy one (sheet). */
export function DomainsDirectory({ freeAddress }: { freeAddress: string }) {
  const { setParams } = useDomainParams()
  return (
    <SettingsPage>
      <SettingsHeader
        title="Domains"
        actions={
          <>
            <Button onClick={() => void setParams({ domainMode: "connect" })}>
              Connect your own
            </Button>
            <Button
              variant="outline"
              onClick={() => void setParams({ domainMode: "buy" })}
            >
              Buy one
            </Button>
          </>
        }
      />
      <Suspense fallback={<DomainListSkeleton />}>
        <DomainList freeAddress={freeAddress} />
      </Suspense>
    </SettingsPage>
  )
}
