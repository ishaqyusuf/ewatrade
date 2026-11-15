"use client"
import { SettingsSection } from "@/components/settings/settings-page"
import {
  SettingsStatusPill,
  type SettingsStatusTone,
} from "@/components/settings/settings-status-pill"
import { cn } from "@/utils"
import { Button } from "@ewatrade/ui"
import { WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  CONNECTION_LIFECYCLE_LABELS,
  CONNECTION_READINESS_LABELS,
  connectionStoresLabel,
} from "./channel-settings-labels"
import type { CustomerChannelConnection } from "./types"

const readinessTone: Record<
  CustomerChannelConnection["readiness"],
  SettingsStatusTone
> = {
  blocked: "bad",
  configuration_required: "warn",
  ready: "ok",
  test_required: "warn",
}

export function ConnectionsList({
  connections,
  onManage,
}: {
  connections: CustomerChannelConnection[]
  onManage: (connectionId: string) => void
}) {
  return (
    <SettingsSection title="WhatsApp numbers">
      {connections.length === 0 ? (
        <p className="px-4 py-3.5 text-muted-foreground">
          No WhatsApp number yet.
        </p>
      ) : (
        connections.map((connection) => {
          const ready = connection.readiness === "ready"
          const name = connection.businessDisplayName
            ? `${connection.businessDisplayName} · ${connection.displayNumber}`
            : connection.displayNumber
          return (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5"
              key={connection.id}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  ready
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
              </span>
              <div className="min-w-0 flex-[1_1_200px]">
                <p className="text-sm font-medium">{name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {CONNECTION_LIFECYCLE_LABELS[connection.lifecycle]} ·{" "}
                  {connectionStoresLabel(connection.storeAssignments)}
                </p>
                {connection.lastTestFailureCode ? (
                  <p className="mt-0.5 text-sm text-destructive">
                    The last check failed.
                  </p>
                ) : null}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <SettingsStatusPill tone={readinessTone[connection.readiness]}>
                  {CONNECTION_READINESS_LABELS[connection.readiness]}
                </SettingsStatusPill>
                <Button
                  aria-label={`Manage ${connection.displayNumber}`}
                  onClick={() => onManage(connection.id)}
                  type="button"
                  variant="outline"
                >
                  Manage
                </Button>
              </div>
            </div>
          )
        })
      )}
    </SettingsSection>
  )
}
