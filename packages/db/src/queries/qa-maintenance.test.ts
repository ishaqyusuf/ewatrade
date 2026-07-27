import { afterEach, describe, expect, test } from "bun:test"
import { configuredQaDomainForEmail } from "./qa-maintenance"

const original = process.env.EMAIL_QA_DOMAIN_ROUTES

afterEach(() => {
  if (original === undefined) process.env.EMAIL_QA_DOMAIN_ROUTES = undefined
  else process.env.EMAIL_QA_DOMAIN_ROUTES = original
})

describe("EwaTrade QA tenant classification", () => {
  test("classifies only configured owner domains", () => {
    process.env.EMAIL_QA_DOMAIN_ROUTES = '{"ewa.test":"tester@example.com"}'
    expect(configuredQaDomainForEmail("owner@ewa.test")).toBe("ewa.test")
    expect(configuredQaDomainForEmail("owner@example.com")).toBeNull()
  })
})
