import { expect, test } from "bun:test"
import { clearSignupAge, readSignupAge, saveSignupAge } from "./signup-age"

function storageFixture() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

test("confirmed age survives the verification redirect for the same signup attempt", async () => {
  const storage = storageFixture()
  await saveSignupAge(storage, "ea_fixture", "ADULT", 1000)
  expect(await readSignupAge(storage, "ea_fixture", 2000)).toBe("ADULT")
  expect([...storage.values.values()].join()).not.toContain("ea_fixture")
  clearSignupAge(storage)
  expect(await readSignupAge(storage, "ea_fixture", 2000)).toBeNull()
})

test("another signup attempt and an expired declaration ask for age again", async () => {
  const storage = storageFixture()
  await saveSignupAge(storage, "first", "AGE_13_TO_15", 1000)
  expect(await readSignupAge(storage, "second", 2000)).toBeNull()
  await saveSignupAge(storage, "first", "AGE_16_TO_17", 1000)
  expect(
    await readSignupAge(storage, "first", 1000 + 24 * 60 * 60 * 1000),
  ).toBeNull()
  await saveSignupAge(storage, "first", "ADULT", 3000)
  expect(await readSignupAge(storage, "first", 2000)).toBeNull()
})

test("missing tokens, malformed records and under-13 values cannot resume signup", async () => {
  const storage = storageFixture()
  await saveSignupAge(storage, "", "ADULT", 1000)
  expect(storage.values.size).toBe(0)
  await saveSignupAge(storage, "first", "ADULT", 1000)
  expect(await readSignupAge(storage, "", 2000)).toBeNull()
  const record = storage.getItem("ewatrade.signup-age")
  if (!record) throw new Error("Expected a saved age declaration")
  storage.setItem("ewatrade.signup-age", record.replace("ADULT", "UNDER_13"))
  expect(await readSignupAge(storage, "first", 2000)).toBeNull()
  storage.setItem("ewatrade.signup-age", "broken JSON")
  expect(await readSignupAge(storage, "first", 2000)).toBeNull()
})

test("browser storage restrictions leave the ordinary signup gate usable", async () => {
  const storage = {
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
    removeItem: () => {
      throw new Error("blocked")
    },
  }
  await saveSignupAge(storage, "first", "ADULT")
  expect(await readSignupAge(storage, "first")).toBeNull()
  expect(() => clearSignupAge(storage)).not.toThrow()
})
