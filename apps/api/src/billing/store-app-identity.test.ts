import { expect, test } from "bun:test"
import {
  requireAppleStoreIdentity,
  requirePlayStorePackage,
} from "./store-app-identity"

test("accepts only the registered Apple bundle and production app ID", () => {
  expect(() =>
    requireAppleStoreIdentity("com.ewatrade.app", 6815837585, true),
  ).not.toThrow()
  expect(() =>
    requireAppleStoreIdentity("com.other.app", 6815837585, true),
  ).toThrow("identity")
  expect(() =>
    requireAppleStoreIdentity("com.ewatrade.app", 1234567890, true),
  ).toThrow("identity")
  expect(() =>
    requireAppleStoreIdentity("com.ewatrade.app", undefined, false),
  ).not.toThrow()
  expect(() =>
    requireAppleStoreIdentity("com.other.app", undefined, false),
  ).toThrow("identity")
})

test("accepts only the registered Google Play package", () => {
  expect(requirePlayStorePackage(" com.ewatrade.app ")).toBe("com.ewatrade.app")
  expect(() => requirePlayStorePackage("com.other.app")).toThrow("identity")
  expect(() => requirePlayStorePackage(undefined)).toThrow("identity")
})
