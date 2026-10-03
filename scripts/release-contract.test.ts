import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { assertBundleContract, releaseContract } from "./release-contract"

test("signed contract rejects policy and toolkit substitution", () => {
  const contract = releaseContract(
    resolve(import.meta.dir, ".."),
    "fef51031b8964dcd8043ee5d6a7558e482e7055d",
  )
  expect(() => assertBundleContract(contract, contract)).not.toThrow()
  expect(() =>
    assertBundleContract(
      { ...contract, policyFingerprint: "0".repeat(64) },
      contract,
    ),
  ).toThrow("policy")
  expect(() =>
    assertBundleContract(
      { ...contract, toolkitRevision: "0".repeat(40) },
      contract,
    ),
  ).toThrow("toolkit")
  expect(() => assertBundleContract({}, contract)).toThrow()
})
