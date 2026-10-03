export const RELEASE_VERCEL_CLI: "vercel@54.4.1"
export const EWATRADE_VERCEL_API_TARGET: Readonly<{
  projectId: "prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh"
  teamId: "team_BV5rgKHJH4fMyFL1YfscZIZK"
}>

export interface VercelDeploymentIdentity {
  readonly id: string
  readonly url: string
}

export interface ExpectedVercelDeployment extends VercelDeploymentIdentity {
  readonly projectId: string
  readonly teamId: string
  readonly environment: "production" | "preview"
}

export interface OwnedVercelDeployment extends ExpectedVercelDeployment {
  readonly createdAt: number
  readonly readyAt: number
}

export function parseVercelDeploymentOutput(
  output: string,
): VercelDeploymentIdentity

export function assertOwnedVercelDeployment(
  raw: unknown,
  expected: ExpectedVercelDeployment,
  now?: number,
): OwnedVercelDeployment
