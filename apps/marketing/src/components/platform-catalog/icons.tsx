const paths = {
  share:
    "M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  wa: "M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20zM9 9.5c0 3 2.5 5.5 5.5 5.5l1.3-1.3-1.8-1-1 .8a3.5 3.5 0 0 1-2.3-2.3l.8-1-1-1.8L9 9.5z",
  chat: "M4 5h16v11H8l-4 4V5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4-4",
  back: "M15 5l-7 7 7 7",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
} as const

export function PlatformIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
