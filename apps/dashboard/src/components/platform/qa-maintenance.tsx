"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { MetricCard } from "@/components/reports/metric-card"
import { ReportSection } from "@/components/reports/report-section"
import {
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function QaMaintenance() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const candidates = useQuery(trpc.qaMaintenance.candidates.queryOptions())
  const preview = useQuery(trpc.qaMaintenance.preview.queryOptions())
  const adopt = useMutation(
    trpc.qaMaintenance.adopt.mutationOptions({
      onSuccess: async () => {
        setSelected([])
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.qaMaintenance.candidates.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.qaMaintenance.preview.queryFilter(),
          ),
        ])
      },
    }),
  )
  const purge = useMutation(
    trpc.qaMaintenance.start.mutationOptions({
      onSuccess: () => setConfirmation(""),
    }),
  )

  return (
    <div className="grid gap-6">
      <ReportSection
        title="Candidate QA tenants"
        description="Adoption is explicit; matching an email domain alone never makes a tenant purgeable."
      >
        {candidates.isPending ? (
          <output className="text-sm text-muted-foreground">
            Loading candidates…
          </output>
        ) : null}
        {candidates.isError ? (
          <FormFeedback appearance="dashboard">
            {candidates.error.message}
          </FormFeedback>
        ) : null}
        <FieldGroup className="gap-3">
          {candidates.data?.map((candidate) => (
            <CheckboxField
              key={candidate.id}
              label={<span>{candidate.name}</span>}
            >
              <Checkbox
                disabled={adopt.isPending || purge.isPending}
                checked={selected.includes(candidate.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, candidate.id]
                      : current.filter((id) => id !== candidate.id),
                  )
                }
              />
            </CheckboxField>
          ))}
          {candidates.isSuccess && !candidates.data.length && (
            <p className="text-sm text-muted-foreground">
              No candidates found.
            </p>
          )}
        </FieldGroup>
        {adopt.isError ? (
          <FormFeedback appearance="dashboard">
            {adopt.error.message}
          </FormFeedback>
        ) : null}
        {adopt.isSuccess ? (
          <FormFeedback appearance="dashboard" variant="default">
            Selected tenants were adopted as QA.
          </FormFeedback>
        ) : null}
        <SubmitButton
          type="button"
          isSubmitting={adopt.isPending}
          className="w-fit"
          variant="outline"
          disabled={
            !selected.length ||
            adopt.isPending ||
            purge.isPending ||
            !candidates.isSuccess
          }
          onClick={() => adopt.mutate({ tenantIds: selected })}
        >
          Adopt selected as QA
        </SubmitButton>
      </ReportSection>

      <ReportSection title="Purge preview">
        {preview.isPending ? (
          <output className="text-sm text-muted-foreground">
            Loading preview…
          </output>
        ) : null}
        {preview.isError ? (
          <FormFeedback appearance="dashboard">
            {preview.error.message}
          </FormFeedback>
        ) : null}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(preview.data?.counts ?? {}).map(([label, value]) => (
            <MetricCard
              key={label}
              label={label.replaceAll("_", " ")}
              value={String(value)}
            />
          ))}
        </div>
        {!!preview.data?.blockers.length && (
          <FormFeedback appearance="dashboard">
            Deletion is blocked by {preview.data.blockers.length} live
            commercial resource(s).
          </FormFeedback>
        )}
        <ControlField
          label={
            <>
              Type <strong>PURGE ALL QA DATA</strong> to permanently continue.
            </>
          }
        >
          <Input
            disabled={purge.isPending || adopt.isPending}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </ControlField>
        {purge.isError ? (
          <FormFeedback appearance="dashboard">
            {purge.error.message}
          </FormFeedback>
        ) : null}
        {purge.isSuccess ? (
          <FormFeedback appearance="dashboard" variant="default">
            The QA purge was requested.
          </FormFeedback>
        ) : null}
        <SubmitButton
          type="button"
          isSubmitting={purge.isPending}
          className="w-fit"
          variant="destructive"
          disabled={
            confirmation !== "PURGE ALL QA DATA" ||
            !preview.data?.previewToken ||
            !!preview.data.blockers.length ||
            purge.isPending ||
            adopt.isPending ||
            !preview.isSuccess
          }
          onClick={() =>
            preview.data?.previewToken &&
            purge.mutate({
              confirmation: "PURGE ALL QA DATA",
              previewToken: preview.data.previewToken,
            })
          }
        >
          Permanently purge all QA data
        </SubmitButton>
      </ReportSection>
    </div>
  )
}
