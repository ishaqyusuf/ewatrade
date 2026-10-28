import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  CommerceLink,
  type CommerceNavigation,
  CommerceNavigationProvider,
} from "./navigation"

test("the live host routes internal links, preserving external and anchor navigation", () => {
  const navigation: CommerceNavigation = {
    Link: ({ children, ...props }) => (
      <a {...props} data-soft-link>
        {children}
      </a>
    ),
    navigate: () => {},
    refresh: () => {},
    pending: false,
  }
  const html = renderToStaticMarkup(
    <CommerceNavigationProvider value={navigation}>
      <CommerceLink href="/services" aria-current="page">
        Services
      </CommerceLink>
      <CommerceLink href="/?item=product-a">Product</CommerceLink>
      <CommerceLink href="https://wa.me/2348000000000" target="_blank">
        Message
      </CommerceLink>
      <CommerceLink href="//example.com/">External</CommerceLink>
      <CommerceLink href="#cs-main">Skip</CommerceLink>
    </CommerceNavigationProvider>,
  )
  expect(html.match(/data-soft-link/g)).toHaveLength(2)
  expect(html).toContain('href="/services" aria-current="page"')
  expect(html).toContain('href="https://wa.me/2348000000000" target="_blank"')
  expect(html).toContain('href="#cs-main"')
})

test("standalone template and Studio links need no Next router", () => {
  expect(
    renderToStaticMarkup(<CommerceLink href="#">Preview</CommerceLink>),
  ).toBe('<a href="#">Preview</a>')
})
