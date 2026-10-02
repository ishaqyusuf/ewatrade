import { expect, test } from "bun:test"
import {
  createSignupWorkspaceSlug,
  resolveSignupWorkspace,
} from "./signup-workspace"

const env = { EMAIL_QA_DOMAIN_ROUTES: '{"ishaq.qa.test":"tester@example.com"}' }

test("automatic business identity handles accents, empty ASCII names and QA length", () => {
  expect(createSignupWorkspaceSlug("  Café & Goods!  ")).toMatch(
    /^cafe-goods-[a-f0-9]{8}$/,
  )
  expect(createSignupWorkspaceSlug("商店")).toMatch(/^business-[a-f0-9]{8}$/)
  const generated = createSignupWorkspaceSlug("a".repeat(120))
  const qa = resolveSignupWorkspace({
    slug: generated,
    email: "qa@ishaq.qa.test",
    env,
  })
  expect(qa.slug).toBe(`${generated}-qa`)
  expect(qa.slug.length).toBe(32)
})

test("configured QA uses a separate slug in every runtime, without repeated suffixes", () => {
  for (const slug of ["hello", "hello-qa"]) {
    expect(
      resolveSignupWorkspace({ slug, email: "QA@ISHAQ.QA.TEST", env }),
    ).toEqual({
      slug: "hello-qa",
      qaSourceDomain: "ishaq.qa.test",
    })
  }
})

test("ordinary signup keeps its slug and missing email does not infer QA", () => {
  for (const email of [undefined, "owner@example.com"]) {
    expect(resolveSignupWorkspace({ slug: "hello", email, env })).toEqual({
      slug: "hello",
      qaSourceDomain: null,
    })
  }
})

test("unconfigured QA domains and malformed routes cannot claim ordinary names", () => {
  for (const email of ["qa@unknown.test", "qa@sub.ishaq.qa.test"]) {
    expect(() =>
      resolveSignupWorkspace({ slug: "hello", email, env }),
    ).toThrow()
  }
  expect(() =>
    resolveSignupWorkspace({
      slug: "hello",
      email: "qa@ishaq.qa.test",
      env: {},
    }),
  ).toThrow()
  expect(() =>
    resolveSignupWorkspace({
      slug: "hello",
      email: "qa@ishaq.qa.test",
      env: { EMAIL_QA_DOMAIN_ROUTES: "invalid" },
    }),
  ).toThrow()
})

test("QA suffix fits the web length limit without a trailing base hyphen", () => {
  const workspace = resolveSignupWorkspace({
    slug: `${"a".repeat(28)}-abc`,
    email: "qa@ishaq.qa.test",
    env,
  })
  expect(workspace.slug).toBe(`${"a".repeat(28)}-qa`)
  expect(workspace.slug.length).toBeLessThanOrEqual(32)
})
