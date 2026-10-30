"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useStorefrontParams } from "@/hooks/use-storefront-params"
import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import { getTemplateManifest } from "@ewatrade/storefront-templates"
import { Button, Sheet, Skeleton } from "@ewatrade/ui"
import {
  StorefrontContentContextForm,
  StorefrontContentGuidance,
} from "./storefront-content-context"
import { StorefrontContentReview } from "./storefront-content-review"
import { StorefrontContentWrite } from "./storefront-content-write"
import {
  type ContentApply,
  useStorefrontContent,
} from "./use-storefront-content"

/** The content generator body; its sheet owner loads it on first open. */
export function StorefrontContentPanel(props: {
  siteId: string
  revision: number
  composition: StorefrontComposition
  pageKey: string
  sectionId: string
  blocked: boolean
  onApply: (input: ContentApply) => boolean
}) {
  const params = useStorefrontParams()
  const open = !!params.content
  const close = () => {
    void params.setParams({ content: null })
  }
  const write = () => {
    void params.setParams({ content: "write" })
  }
  const controller = useStorefrontContent({
    ...props,
    open,
    onClose: close,
    onWrite: write,
    onContext: () => {
      void params.setParams({ content: "context" })
    },
  })
  const manifest = getTemplateManifest(props.composition)
  const pageLabel =
    manifest.pages.find((page) => page.key === props.pageKey)?.label ??
    props.pageKey
  const failed =
    controller.currentRun?.status === "FAILED" ||
    controller.currentRun?.status === "CANCELLED"
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <SheetFrame
        title="Generate content"
        description={`${pageLabel} · ${manifest.name} · Draft rev ${props.revision}`}
        popupClassName="sf-content-sheet sm:w-[min(650px,95vw)] sm:max-w-[650px]"
        headerClassName="sf-content-sheet-header"
        contentClassName="sf-content-sheet-body"
        finalFocus={() =>
          document.querySelector<HTMLElement>(
            "[data-storefront-content-trigger]",
          ) ?? false
        }
        header={
          <fieldset
            className="sf-content-tabs"
            aria-label="Content generation panels"
          >
            {(
              [
                ["write", "Write"],
                ["context", "Business context"],
                ["guidance", "Template guidance"],
              ] as const
            ).map(([panel, label]) => (
              <button
                type="button"
                key={panel}
                aria-pressed={(params.content ?? "write") === panel}
                disabled={controller.pending}
                onClick={() => void params.setParams({ content: panel })}
              >
                {label}
              </button>
            ))}
          </fieldset>
        }
        footer={
          <div className="sf-content-footer">
            <p>
              {controller.reviewing
                ? "Apply creates unsaved edits. Save and publish separately."
                : "Content and design proposals share the daily generation allowance."}
            </p>
            <div className="sf-content-between">
              <Button
                variant="outline"
                disabled={controller.cancelPending || controller.requesting}
                onClick={() => {
                  if (controller.active) void controller.cancel()
                  else if (controller.reviewing) controller.setReviewing(false)
                  else close()
                }}
              >
                {controller.cancelPending
                  ? "Cancelling…"
                  : controller.active
                    ? "Cancel generation"
                    : controller.reviewing
                      ? "Choose areas again"
                      : "Cancel"}
              </Button>
              {controller.reviewing && !controller.pending ? (
                <Button
                  disabled={
                    props.blocked ||
                    controller.stale ||
                    !controller.validSelected ||
                    controller.context.isError
                  }
                  onClick={controller.apply}
                >
                  Apply {controller.selectedRows.length}{" "}
                  {controller.selectedRows.length === 1 ? "area" : "areas"} to
                  draft
                </Button>
              ) : (
                <Button
                  disabled={
                    props.blocked ||
                    controller.pending ||
                    controller.unavailable ||
                    controller.currentRun?.needsReconciliation ||
                    !controller.fields.length
                  }
                  onClick={() => void controller.generate()}
                >
                  {controller.pending
                    ? "Generating…"
                    : failed
                      ? "Generate again"
                      : "Generate draft"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {controller.context.isPending ? (
          <div className="sf-content-stack">
            <output aria-live="polite">Loading business context…</output>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : controller.context.isError ? (
          <div className="sf-content-stack">
            <FormFeedback>{controller.context.error.message}</FormFeedback>
            <Button
              variant="outline"
              onClick={() => void controller.context.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            {controller.context.data?.unavailableReason ? (
              <FormFeedback variant="default">
                {controller.context.data.unavailableReason}
              </FormFeedback>
            ) : null}
            {controller.problem ? (
              <FormFeedback>{controller.problem}</FormFeedback>
            ) : null}
            {controller.generation.isError ? (
              <FormFeedback>
                {controller.generation.error.message}{" "}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void controller.checkStatus()}
                >
                  Check status
                </Button>
              </FormFeedback>
            ) : null}
            {controller.terminalMessage ? (
              <FormFeedback
                variant={
                  controller.currentRun?.status === "CANCELLED"
                    ? "default"
                    : "destructive"
                }
              >
                {controller.terminalMessage}
                {controller.currentRun?.needsReconciliation ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void controller.checkStatus()}
                  >
                    Check status
                  </Button>
                ) : null}
              </FormFeedback>
            ) : null}
            {controller.stale ? (
              <FormFeedback>
                Your draft changed. Choose areas again and generate from the
                current page before applying content.
              </FormFeedback>
            ) : null}
            {controller.pending ? (
              <div className="sf-content-loading" aria-busy="true">
                <span aria-hidden="true">✧</span>
                <h3>
                  {controller.currentRun?.status === "QUEUED"
                    ? "Your content draft is queued"
                    : "Finding the right words…"}
                </h3>
                <output aria-live="polite">
                  Using your template guidance, selected content areas and
                  business context. You can close this panel and return later.
                </output>
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
                {controller.timedOut ? (
                  <Button
                    variant="outline"
                    onClick={() => void controller.checkStatus()}
                  >
                    Check status
                  </Button>
                ) : null}
              </div>
            ) : params.content === "context" ? (
              <StorefrontContentContextForm
                form={controller.contextForm}
                onDone={write}
              />
            ) : params.content === "guidance" ? (
              <StorefrontContentGuidance composition={props.composition} />
            ) : controller.reviewing ? (
              <StorefrontContentReview controller={controller} />
            ) : (
              <StorefrontContentWrite
                controller={controller}
                pageLabel={pageLabel}
                templateName={manifest.name}
                onContext={() => void params.setParams({ content: "context" })}
              />
            )}
          </>
        )}
      </SheetFrame>
    </Sheet>
  )
}
