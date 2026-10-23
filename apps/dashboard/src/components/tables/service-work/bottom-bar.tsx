"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { createMessageFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { BottomBar } from "@/components/tables/core"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"

import { AnimatePresence } from "framer-motion"
import { useState } from "react"
import type { useServiceWorkBatch } from "./use-batch-actions"

type BatchActions = ReturnType<typeof useServiceWorkBatch>
export function ServiceWorkBottomBar({
  count,
  deselect,
  batch,
}: { count: number; deselect: () => void; batch: BatchActions }) {
  const [resumeOpen, setResumeOpen] = useState(false)
  const [reason, setReason] = useState("")
  const busy =
    batch.working ||
    batch.batchMutation.isPending ||
    batch.notificationMutation.isPending
  return (
    <>
      <AnimatePresence>
        {count > 0 ? (
          <BottomBar selectedCount={count} onDeselect={deselect}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" disabled={busy}>
                    Update status
                  </Button>
                }
              />
              <DropdownMenuContent appearance="dashboard" align="end">
                <DropdownMenuItem
                  disabled={busy || !batch.eligibleCount("mark_in_progress")}
                  onClick={() =>
                    void batch
                      .updateBatch("mark_in_progress")
                      .catch(() => undefined)
                  }
                >
                  Start work ({batch.eligibleCount("mark_in_progress")})
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy || !batch.eligibleCount("mark_ready")}
                  onClick={() =>
                    void batch.updateBatch("mark_ready").catch(() => undefined)
                  }
                >
                  Mark ready ({batch.eligibleCount("mark_ready")})
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy || !batch.eligibleCount("resume")}
                  onClick={() => {
                    setReason("")
                    setResumeOpen(true)
                  }}
                >
                  Continue work ({batch.eligibleCount("resume")})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => batch.setShowMessage(!batch.showMessage)}
            >
              Message
            </Button>
          </BottomBar>
        ) : null}
      </AnimatePresence>
      <Dialog open={resumeOpen && count > 0} onOpenChange={setResumeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continue selected work</DialogTitle>
            <DialogDescription>
              {batch.eligibleCount("resume")} eligible jobs. Other selected jobs
              stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="batch-resume-reason" className="text-sm font-medium">
            Reason for continuing
          </label>
          <Textarea
            id="batch-resume-reason"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {batch.error ? (
            <FormFeedback appearance="dashboard">{batch.error}</FormFeedback>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setResumeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (await batch.resumeBatch(reason)) setResumeOpen(false)
              }}
            >
              Continue work
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
          placeholder="Message to each customer. {order} becomes their order number"
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
