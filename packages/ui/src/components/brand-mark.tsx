import type { SVGProps } from "react"

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M17 41 29 20H82L64 38H41L36 47H13Z" />
      <path d="M10 97 17 73 44 48H73L92 29 84 21 112 13 104 41 97 34 80 66H52L22 96Z" />
      <path d="M42 82H99L86 102H22Z" />
    </svg>
  )
}
