"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import { type ReactNode, createContext, useContext, useMemo } from "react"
import type { UseFormReturn } from "react-hook-form"
import { z } from "zod"

const operationIdSchema = z.string().min(8).max(160)

export const storeConversationReplyFormSchema = z.object({
  clientOperationId: operationIdSchema,
  request: z.string().min(1),
  text: z.string().trim().min(1).max(2_000),
})

export const storeConversationAssignmentFormSchema = z
  .object({
    action: z.enum(["handoff", "reassign", "release"]),
    clientOperationId: operationIdSchema,
    reason: z.enum([
      "customer_request",
      "membership_unavailable",
      "operational_recovery",
      "shift_change",
      "specialist_handoff",
      "workload_balance",
    ]),
    targetMembershipId: z.string(),
  })
  .superRefine((value, context) => {
    if (value.action !== "release" && !value.targetMembershipId) {
      context.addIssue({
        code: "custom",
        message: "Choose an active attendant.",
        path: ["targetMembershipId"],
      })
    }
  })

export type StoreConversationReplyFormValues = z.infer<
  typeof storeConversationReplyFormSchema
>
export type StoreConversationAssignmentFormValues = z.infer<
  typeof storeConversationAssignmentFormSchema
>

export function newStoreConversationCommandId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function replyDefaults(): StoreConversationReplyFormValues {
  return {
    clientOperationId: newStoreConversationCommandId("reply"),
    request: "",
    text: "",
  }
}

function assignmentDefaults(): StoreConversationAssignmentFormValues {
  return {
    action: "handoff",
    clientOperationId: newStoreConversationCommandId("assignment"),
    reason: "specialist_handoff",
    targetMembershipId: "",
  }
}

type StoreConversationFormContextValue = {
  assignmentForm: UseFormReturn<StoreConversationAssignmentFormValues>
  replyForm: UseFormReturn<StoreConversationReplyFormValues>
  resetAssignment: () => void
  resetReply: () => void
}

const StoreConversationFormContext =
  createContext<StoreConversationFormContextValue | null>(null)

export function StoreConversationFormProvider({
  children,
}: {
  children: ReactNode
}) {
  const replyForm = useZodForm<StoreConversationReplyFormValues>(
    storeConversationReplyFormSchema,
    {
      defaultValues: replyDefaults(),
    },
  )
  const assignmentForm = useZodForm<StoreConversationAssignmentFormValues>(
    storeConversationAssignmentFormSchema,
    {
      defaultValues: assignmentDefaults(),
    },
  )
  const value = useMemo(
    () => ({
      assignmentForm,
      replyForm,
      resetAssignment: () => assignmentForm.reset(assignmentDefaults()),
      resetReply: () => replyForm.reset(replyDefaults()),
    }),
    [assignmentForm, replyForm],
  )

  return (
    <StoreConversationFormContext.Provider value={value}>
      {children}
    </StoreConversationFormContext.Provider>
  )
}

export function useStoreConversationForms() {
  const context = useContext(StoreConversationFormContext)
  if (!context) {
    throw new Error(
      "useStoreConversationForms must be used inside StoreConversationFormProvider.",
    )
  }
  return context
}
