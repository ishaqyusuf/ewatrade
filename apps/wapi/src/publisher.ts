import type { VoiceTarget } from "./targets"

type Dependencies = {
  fetchImpl?: typeof fetch
  log?: (message: string) => void
}

/** Each target owns its CAS state; an outage never prevents another renewal. */
export function createPublisher(
  targets: VoiceTarget[],
  generation: string,
  dependencies: Dependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const log = dependencies.log ?? console.info
  const states = targets.map((target) => ({
    target,
    discovered: false,
    previousGeneration: null as string | null,
  }))
  let running: Promise<void> | undefined
  let controller: AbortController | undefined
  let stopped = false

  async function publishTarget(
    state: (typeof states)[number],
    url: string,
    remove: boolean,
    signal: AbortSignal,
  ) {
    const { target } = state
    const headers = {
      Authorization: `Bearer ${target.publishSecret}`,
      "Content-Type": "application/json",
    }
    const request = (init: RequestInit) =>
      fetchImpl(target.registryUrl, {
        ...init,
        headers,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      })
    try {
      if (!remove && !state.discovered) {
        const response = await request({ method: "GET" })
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error()
        }
        const current = (await response.json()) as {
          lease?: { generation?: string }
        }
        state.previousGeneration = current.lease?.generation ?? null
        state.discovered = true
      }
      const response = await request({
        method: remove ? "DELETE" : "PUT",
        body: JSON.stringify({
          url,
          generation,
          previousGeneration: state.previousGeneration,
          environment: target.environment,
        }),
      })
      await response.body?.cancel()
      if (!response.ok) {
        log(
          `[wapi:${target.environment}] ${remove ? "Withdrawal" : "Registration"} refused (${response.status}); lease will expire. Other environments continue.`,
        )
        return
      }
      if (!remove) state.previousGeneration = generation
      log(
        `[wapi:${target.environment}] Gateway lease ${remove ? "withdrawn" : "renewed"}.`,
      )
    } catch {
      if (!signal.aborted)
        log(
          `[wapi:${target.environment}] Registry unavailable; ${remove ? "lease will expire" : "will retry"}. Other environments continue.`,
        )
    }
  }

  return {
    publish(url: string) {
      if (stopped) return Promise.resolve()
      if (running) return running
      controller = new AbortController()
      const signal = controller.signal
      running = Promise.all(
        states.map((state) => publishTarget(state, url, false, signal)),
      )
        .then(() => {})
        .finally(() => {
          running = undefined
        })
      return running
    },
    async stop(url: string) {
      if (stopped) return
      stopped = true
      controller?.abort()
      await running
      // DELETE is generation-scoped, including an ambiguous PUT outcome.
      await Promise.all(
        states.map((state) =>
          publishTarget(state, url, true, new AbortController().signal),
        ),
      )
    },
  }
}
