import { getAnalyticsPolicy } from "@/lib/analytics-policy"
import { createEventsRoute } from "@ewatrade/events/route"
const ingest = createEventsRoute("marketing")
export async function POST(request: Request) {
  if (!(await getAnalyticsPolicy()).enabled)
    return new Response(null, { status: 204 })
  return ingest(request)
}
