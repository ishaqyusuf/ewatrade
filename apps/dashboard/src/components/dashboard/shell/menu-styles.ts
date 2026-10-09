/**
 * Rounded popup surface for shell menus (rail flyouts, workspace and account
 * menus). The "dashboard" DropdownMenu appearance is square by default, so
 * this re-rounds the popup and its items with the theme radius.
 */
export const SHELL_MENU_CLASS =
  "rounded-[calc(var(--radius)+2px)] p-1 shadow-lg [&_[data-slot$=-item]]:rounded-[calc(var(--radius)-2px)]"

export const SHELL_MENU_LABEL_CLASS =
  "px-2 pt-[7px] pb-1 text-[11.5px] font-semibold text-muted-foreground"

export const SHELL_MENU_ITEM_CLASS = "min-h-8 gap-2.5 px-2 py-1.5 text-[13.5px]"
