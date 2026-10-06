type BuildPaths = {
  stage: string
  home: string
  temp: string
  cache: string
  bunBinary: string
  configPath?: string
  preloadPath?: string
  schemaEngine?: string
  writableDirectories?: string[]
  writableFiles?: string[]
  install?: boolean
}
export function apiBuildEnvironment(
  paths: Pick<BuildPaths, "home" | "temp" | "cache" | "bunBinary">,
): NodeJS.ProcessEnv
export function apiBuildSandboxProfile(paths: BuildPaths): string
export function apiBuildPreload(
  paths: Pick<
    BuildPaths,
    "home" | "temp" | "cache" | "bunBinary" | "schemaEngine"
  >,
): string
export const PRISMA_SCHEMA_ENGINE: Readonly<{
  version: string
  url: string
  compressedBytes: number
  compressedSha256: string
  bytes: number
  sha256: string
}>
export function validatePrismaSchemaEngine(compressed: Buffer): Buffer
export const API_BUILD_RECIPE: Readonly<{
  version: number
  runtime: string
  install: readonly string[]
  generation: string
  workspaceSelection: string
  typecheck: readonly string[]
  bundle: readonly string[]
  upload: string
  providerBuildCommand: string
}>
type ProbeContext = {
  stage: string
  bunBinary: string
  sandboxBinary: string
  configPath: string
  preloadPath?: string
  profile: string
  environment: NodeJS.ProcessEnv
}
export function bundleCommittedApiEntry(context: ProbeContext): string
export function probeApiBuildSandbox(
  context: ProbeContext,
  execute?: (
    label: string,
    binary: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ) => string,
): Promise<void>
export function exportApiBuildOutputs(
  context: ProbeContext,
): Array<{ path: string; bytes: Buffer }>
export function resolveApiBuildTools(context: ProbeContext): {
  prisma: string
  tsc: string
}
export function apiTypeScriptDiagnostics(
  output: string,
  stage: string,
  sourcePaths: readonly string[],
): Readonly<{
  errors: number
  codes: readonly string[]
  locations: ReadonlyArray<
    Readonly<{ path: string; code: string; line: number; column: number }>
  >
}>
export function prepareCommittedApiArtifact(options: {
  repository: string
  revision: string
}): Promise<
  ReturnType<
    typeof import("./release-api-source-stage.mjs").materializeCommittedApiStage
  > & {
    bundleSha256: string
    generatedOutputs: ReadonlyArray<
      Readonly<{ path: string; bytes: number; sha256: string; mode: string }>
    >
    recipe: Readonly<{
      version: number
      runtime: string
      lockSha256: string
      profileSha256: string
    }>
  }
>
