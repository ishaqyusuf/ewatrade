import { useQueryStates } from "nuqs"
import {
  createLoader,
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server"

const requestKinds = [
  "commerce_inquiry",
  "service_request",
  "prescription_request",
] as const

const storeConversationParams = {
  assignment: parseAsStringEnum([
    "all",
    "unassigned",
    "mine",
    "assigned",
  ] as const),
  conversationId: parseAsString,
  conversationSheet: parseAsStringEnum(["detail"] as const),
  cursor: parseAsString,
  direction: parseAsStringEnum(["asc", "desc"] as const),
  q: parseAsString,
  requestKinds: parseAsArrayOf(parseAsStringEnum([...requestKinds])),
  sla: parseAsStringEnum(["all", "awaiting_response", "overdue"] as const),
  sort: parseAsStringEnum([
    "last_customer_activity",
    "response_due_at",
  ] as const),
  store: parseAsString,
}

export function getStoreConversationFilterUpdate<T extends object>(
  values: T,
): T | (T & { cursor: null }) {
  return "cursor" in values ? values : { ...values, cursor: null }
}

export function useStoreConversationParams() {
  const [params, setParams] = useQueryStates(storeConversationParams)
  return {
    ...params,
    setFilters: (values: Partial<typeof params>) =>
      setParams(getStoreConversationFilterUpdate(values), { history: "push" }),
    setSelection: (conversationId: string | null) =>
      setParams(
        {
          conversationId,
          conversationSheet: conversationId ? "detail" : null,
        },
        { history: "push" },
      ),
  }
}

export function getStoreConversationQueueInput(
  params: {
    assignment: "all" | "unassigned" | "mine" | "assigned" | null
    cursor: string | null
    direction: "asc" | "desc" | null
    q: string | null
    requestKinds: (typeof requestKinds)[number][] | null
    sla: "all" | "awaiting_response" | "overdue" | null
    sort: "last_customer_activity" | "response_due_at" | null
    store: string | null
  },
  fallbackStoreId: string,
) {
  return {
    assignment: params.assignment ?? "all",
    ...(params.cursor ? { cursor: params.cursor } : {}),
    pageSize: 25,
    ...(params.q ? { q: params.q } : {}),
    requestKinds: params.requestKinds ?? [],
    sla: params.sla ?? "all",
    sort: [
      params.sort ?? "last_customer_activity",
      params.direction ?? "desc",
    ] as ["last_customer_activity" | "response_due_at", "asc" | "desc"],
    storeId: params.store ?? fallbackStoreId,
  }
}

export const loadStoreConversationParams = createLoader(storeConversationParams)
