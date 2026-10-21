"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { STAFF_LIST_QUERY_KEY } from "@/hooks/use-staff-list"
import { useMutation, useQueryClient } from "@tanstack/react-query"

/** Cancel invite / Remove: takes away someone who never joined and frees the seat. */
export function useRemoveStaff() {
  const workflow = useDashboardWorkflow()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (staffUserId: string) => {
      const response = await workflow.fetch("staff_update", "/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "remove", staffUserId }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(
          result.error ??
            "Couldn’t remove them. Refresh the page and try again.",
        )
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: STAFF_LIST_QUERY_KEY }),
  })
}
