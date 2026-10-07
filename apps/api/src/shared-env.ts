import { applyEwatradeSharedEnv } from "@ewatrade/utils/shared-env"

// Imported first so every module reads the plain names already filled from
// EwaTrade's Vercel shared variables.
applyEwatradeSharedEnv()
