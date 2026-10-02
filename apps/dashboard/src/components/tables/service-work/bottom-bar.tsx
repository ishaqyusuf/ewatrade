"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { createMessageFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { BottomBar } from "@/components/tables/core"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SelectControl,
} from "@ewatrade/ui"

import { AnimatePresence } from "framer-motion"
import type { useServiceWorkBatch } from "./use-batch-actions"

type BatchActions = ReturnType<typeof useServiceWorkBatch>
export function ServiceWorkBottomBar({
  count,
  deselect,
  batch,
}: { count: number; deselect: () => void; batch: BatchActions }) {
  const busy =
    batch.batchMutation.isPending || batch.notificationMutation.isPending
  return (
    <AnimatePresence>
      {count > 0 ? (
        <BottomBar selectedCount={count} onDeselect={deselect}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="rounded-none"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                >
                  Actions
                </Button>
              }
            />
            <DropdownMenuContent appearance="dashboard" align="end">
              <DropdownMenuItem
                disabled={busy}
                onClick={() =>
                  void batch
                    .updateBatch("mark_in_progress")
                    .catch(() => undefined)
                }
              >
                Start work
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                onClick={() =>
                  void batch.updateBatch("mark_ready").catch(() => undefined)
                }
              >
                Mark ready
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                onClick={() =>
                  void batch.updateBatch("delay").catch(() => undefined)
                }
              >
                Delay 1 day + notify
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BottomBar>
      ) : null}
    </AnimatePresence>
  )
}
export function ServiceWorkBatchMessage({ batch }: { batch: BatchActions }) {
  return (
    <section
      aria-label="Message selected jobs"
      className="grid gap-3 border border-border p-4"
    >
      <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
        <SelectControl
          aria-label="Message channel"
          value={batch.channel}
          onValueChange={(value) =>
            batch.setChannel(value === "sms" ? "sms" : "whatsapp")
          }
          options={[
            { value: "whatsapp", label: <>WhatsApp</> },
            { value: "sms", label: <>SMS</> },
          ]}
        />
        <Input
          aria-label="Message for selected jobs"
          placeholder="Message; use {order} for the order number"
          value={batch.message}
          onChange={(event) => batch.setMessage(event.target.value)}
        />
        <Button
          className="rounded-none"
          size="sm"
          disabled={
            !batch.message.trim() ||
            batch.notificationMutation.isPending ||
            batch.batchMutation.isPending
          }
          onClick={batch.sendBatchMessage}
        >
          Send update
        </Button>
      </div>
      <QaDashboardQuickFill
        canUndo={batch.qaMessageSnapshot.current !== null}
        formId="dashboard.service.message"
        isDirty={Boolean(batch.message)}
        onFill={(context) => {
          batch.qaMessageSnapshot.current = batch.message
          batch.setMessage(createMessageFixture(context).message)
        }}
        onUndo={() => {
          if (batch.qaMessageSnapshot.current === null) return
          batch.setMessage(batch.qaMessageSnapshot.current)
          batch.qaMessageSnapshot.current = null
        }}
      />
      {batch.error ? (
        <FormFeedback appearance="dashboard">{batch.error}</FormFeedback>
      ) : null}
    </section>
  )
}
