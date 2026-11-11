;(() => {
  // Icon geometry from the same Hugeicons definitions as the native Home.
  const icons = {
    store:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.50002 10V15C3.50002 17.8284 3.50002 19.2426 4.37869 20.1213C5.25737 21 6.67159 21 9.50002 21H14.5C17.3284 21 18.7427 21 19.6213 20.1213C20.5 19.2426 20.5 17.8284 20.5 15V10"/><path d="M17 7.50184C17 8.88255 15.8807 9.99997 14.5 9.99997C13.1193 9.99997 12 8.88068 12 7.49997C12 8.88068 10.8807 9.99997 9.50002 9.99997C8.1193 9.99997 7.00002 8.88068 7.00002 7.49997C7.00002 8.88068 5.82655 9.99997 4.37901 9.99997C3.59984 9.99997 2.90008 9.67567 2.42 9.16087C1.59462 8.2758 2.12561 6.97403 2.81448 5.98842L3.20202 5.45851C4.08386 4.2527 4.52478 3.6498 5.16493 3.32494C5.80508 3.00008 6.55201 3.00018 8.04587 3.00038L15.9551 3.00143C17.4485 3.00163 18.1952 3.00173 18.8351 3.32658C19.475 3.65143 19.9158 4.25414 20.7974 5.45957L21.1855 5.99029C21.8744 6.97589 22.4054 8.27766 21.58 9.16273C21.0999 9.67754 20.4002 10.0018 19.621 10.0018C18.1734 10.0018 17 8.88255 17 7.50184Z"/><path d="M14.9971 17C14.3133 17.6072 13.2247 18 11.9985 18C10.7723 18 9.68376 17.6072 9 17"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H9C5.69067 2 5 2.69067 5 6V22H19V6C19 2.69067 18.3093 2 15 2Z"/><path d="M3 22H21"/><path d="M15 22V19C15 17.3453 14.6547 17 13 17H11C9.34533 17 9 17.3453 9 19V22"/><path d="M13.5 6H10.5M13.5 9.5H10.5M13.5 13H10.5"/></svg>',
    delivery:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/><path d="M11 17H15M13.5 7H14.4429C15.7533 7 16.4086 7 16.9641 7.31452C17.5196 7.62904 17.89 8.20972 18.6308 9.37107C19.1502 10.1854 19.6955 10.7765 20.4622 11.3024C21.2341 11.8318 21.6012 12.0906 21.8049 12.506C22 12.9038 22 13.375 22 14.3173C22 15.5596 22 16.1808 21.651 16.5755C21.636 16.5925 21.6207 16.609 21.6049 16.625C21.2375 17 20.6594 17 19.503 17H19"/><path d="M13 7L13.9942 9.48556C14.4813 10.7034 14.7249 11.3123 15.2328 11.6561C15.7407 12 16.3965 12 17.7081 12H21"/><path d="M4.86957 17C3.51684 17 2.84048 17 2.42024 16.5607C2 16.1213 2 15.4142 2 14V7C2 5.58579 2 4.87868 2.42024 4.43934C2.84048 4 3.51684 4 4.86957 4H10.1304C11.4832 4 12.1595 4 12.5798 4.43934C13 4.87868 13 5.58579 13 7V17H8.69565"/></svg>',
    approval:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.7088 3.49534C16.8165 2.55382 14.5009 2 12 2C9.4991 2 7.1835 2.55382 5.29116 3.49534C4.36318 3.95706 3.89919 4.18792 3.4496 4.91378C3 5.63965 3 6.34248 3 7.74814V11.2371C3 16.9205 7.54236 20.0804 10.173 21.4338C10.9067 21.8113 11.2735 22 12 22C12.7265 22 13.0933 21.8113 13.8269 21.4338C16.4576 20.0804 21 16.9205 21 11.2371L21 7.74814C21 6.34249 21 5.63966 20.5504 4.91378C20.1008 4.18791 19.6368 3.95706 18.7088 3.49534Z"/><path d="M9 11.5C9 11.5 10.4079 11.7519 11 13.5C11 13.5 12.5 10.5 15 9.5"/></svg>',
    customer:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8.5C17 5.73858 14.7614 3.5 12 3.5C9.23858 3.5 7 5.73858 7 8.5C7 11.2614 9.23858 13.5 12 13.5C14.7614 13.5 17 11.2614 17 8.5Z"/><path d="M19 20.5C19 16.634 15.866 13.5 12 13.5C8.13401 13.5 5 16.634 5 20.5"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 8C15 5.23858 12.7614 3 10 3C7.23858 3 5 5.23858 5 8C5 10.7614 7.23858 13 10 13C12.7614 13 15 10.7614 15 8Z"/><path d="M17.5 21L17.5 14M14 17.5H21"/><path d="M3 20C3 16.134 6.13401 13 10 13C11.4872 13 12.8662 13.4638 14 14.2547"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.001 5.00003V19.002"/><path d="M19.002 12.002L4.99998 12.002"/></svg>',
    package:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 22C11.1818 22 10.4002 21.6698 8.83693 21.0095C4.94564 19.3657 3 18.5438 3 17.1613C3 16.7742 3 10.0645 3 7M12 22C12.8182 22 13.5998 21.6698 15.1631 21.0095C19.0544 19.3657 21 18.5438 21 17.1613V7M12 22L12 11.3548"/><path d="M8.32592 9.69138L5.40472 8.27785C3.80157 7.5021 3 7.11423 3 6.5C3 5.88577 3.80157 5.4979 5.40472 4.72215L8.32592 3.30862C10.1288 2.43621 11.0303 2 12 2C12.9697 2 13.8712 2.4362 15.6741 3.30862L18.5953 4.72215C20.1984 5.4979 21 5.88577 21 6.5C21 7.11423 20.1984 7.5021 18.5953 8.27785L15.6741 9.69138C13.8712 10.5638 12.9697 11 12 11C11.0303 11 10.1288 10.5638 8.32592 9.69138Z"/><path d="M6 12L8 13"/><path d="M17 4L7 9"/></svg>',
    wallet:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3H5C3.89543 3 3 3.89543 3 5C3 6.10457 3.89543 7 5 7H18C18 6.07003 18 5.60504 17.8978 5.22354C17.6204 4.18827 16.8117 3.37962 15.7765 3.10222C15.395 3 14.93 3 14 3Z"/><path d="M3 5V15C3 17.8284 3 19.2426 3.87868 20.1213C4.75736 21 6.17157 21 9 21H15C17.8284 21 19.2426 21 20.1213 20.1213C21 19.2426 21 17.8284 21 15V13C21 10.1716 21 8.75736 20.1213 7.87868C19.2426 7 17.8284 7 15 7H7"/><path d="M21 12H19C18.535 12 18.3025 12 18.1118 12.0511C17.5941 12.1898 17.1898 12.5941 17.0511 13.1118C17 13.3025 17 13.535 17 14C17 14.465 17 14.6975 17.0511 14.8882C17.1898 15.4059 17.5941 15.8102 18.1118 15.9489C18.3025 16 18.535 16 19 16H21"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.99969 17.0002C2.99969 17.9302 2.99969 18.3952 3.10192 18.7767C3.37932 19.8119 4.18796 20.6206 5.22324 20.898C5.60474 21.0002 6.06972 21.0002 6.99969 21.0002L16.9997 21.0002C17.9297 21.0002 18.3947 21.0002 18.7762 20.898C19.8114 20.6206 20.6201 19.8119 20.8975 18.7767C20.9997 18.3952 20.9997 17.9302 20.9997 17.0002"/><path d="M16.4998 11.5002C16.4998 11.5002 13.1856 16.0002 11.9997 16.0002C10.8139 16.0002 7.49976 11.5002 7.49976 11.5002M11.9997 15.0002V3.00016"/></svg>',
    sparkles:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 2L15.5387 4.39157C15.9957 6.42015 17.5798 8.00431 19.6084 8.46127L22 9L19.6084 9.53873C17.5798 9.99569 15.9957 11.5798 15.5387 13.6084L15 16L14.4613 13.6084C14.0043 11.5798 12.4202 9.99569 10.3916 9.53873L8 9L10.3916 8.46127C12.4201 8.00431 14.0043 6.42015 14.4613 4.39158L15 2Z"/><path d="M7 12L7.38481 13.7083C7.71121 15.1572 8.84275 16.2888 10.2917 16.6152L12 17L10.2917 17.3848C8.84275 17.7112 7.71121 18.8427 7.38481 20.2917L7 22L6.61519 20.2917C6.28879 18.8427 5.15725 17.7112 3.70827 17.3848L2 17L3.70827 16.6152C5.15725 16.2888 6.28879 15.1573 6.61519 13.7083L7 12Z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 11.9896V14.5C3 17.7998 3 19.4497 4.02513 20.4749C5.05025 21.5 6.70017 21.5 10 21.5H14C17.2998 21.5 18.9497 21.5 19.9749 20.4749C21 19.4497 21 17.7998 21 14.5V11.9896C21 10.3083 21 9.46773 20.6441 8.74005C20.2882 8.01237 19.6247 7.49628 18.2976 6.46411L16.2976 4.90855C14.2331 3.30285 13.2009 2.5 12 2.5C10.7991 2.5 9.76689 3.30285 7.70242 4.90855L5.70241 6.46411C4.37533 7.49628 3.71179 8.01237 3.3559 8.74005C3 9.46773 3 10.3083 3 11.9896Z" fill="currentColor"/><path d="M15.0002 17C14.2007 17.6224 13.1504 18 12.0002 18C10.8499 18 9.79971 17.6224 9.00018 17" stroke="var(--dock-surface)"/></svg>',
    orders:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8.06805 2.72546L7.89604 2.86189C7.71084 3.00878 7.61823 3.08223 7.52605 3.12852C7.20698 3.28874 6.8259 3.26781 6.52663 3.07364C6.44017 3.01754 6.35631 2.93441 6.1886 2.76813C5.78856 2.37152 5.58853 2.17321 5.43777 2.10043C4.89824 1.83999 4.25045 2.10601 4.0547 2.6684C4 2.82556 4 3.10601 4 3.66691V20.698C4 20.9548 4 21.0832 4.01158 21.158C4.12554 21.8938 4.98624 22.2473 5.59159 21.8069C5.65313 21.7621 5.74474 21.6713 5.92789 21.4897C6.0431 21.3755 6.10079 21.3183 6.15539 21.2735C6.66242 20.8578 7.38352 20.8182 7.93376 21.1759C7.99303 21.2144 8.05667 21.2649 8.18395 21.3658L8.32009 21.4738C8.55044 21.6565 8.66564 21.7479 8.78105 21.8104C9.22912 22.053 9.77088 22.053 10.219 21.8104C10.3344 21.7479 10.4495 21.6565 10.6799 21.4738L10.75 21.4182C11.047 21.1827 11.1955 21.0649 11.3484 20.9918C11.7601 20.7949 12.2399 20.7949 12.6516 20.9918C12.8045 21.0649 12.953 21.1827 13.25 21.4182L13.3201 21.4738C13.5505 21.6565 13.6656 21.7479 13.781 21.8104C14.2291 22.053 14.7709 22.053 15.219 21.8104C15.3344 21.7479 15.4496 21.6565 15.6799 21.4738L15.816 21.3658C15.9433 21.2649 16.007 21.2144 16.0662 21.1759C16.6165 20.8182 17.3376 20.8578 17.8446 21.2735C17.8992 21.3183 17.9569 21.3755 18.0721 21.4897C18.2553 21.6713 18.3469 21.7621 18.4084 21.8069C19.0138 22.2473 19.8745 21.8938 19.9884 21.158C20 21.0832 20 20.9548 20 20.698V3.66691C20 3.10601 20 2.82556 19.9453 2.6684C19.7495 2.10601 19.1018 1.83999 18.5622 2.10043C18.4115 2.17321 18.2114 2.37152 17.8114 2.76813C17.6437 2.93441 17.5598 3.01754 17.4734 3.07364C17.1741 3.26781 16.793 3.28874 16.4739 3.12852C16.3818 3.08223 16.2892 3.00878 16.104 2.86189L15.932 2.72546C15.4614 2.35223 15.2261 2.16562 14.9695 2.08178C14.6646 1.98214 14.3354 1.98214 14.0305 2.08178C13.7739 2.16562 13.5386 2.35224 13.068 2.72546L13 2.77943C12.6428 3.06273 12.4642 3.20438 12.2661 3.2586C12.092 3.30627 11.908 3.30627 11.7339 3.2586C11.5358 3.20438 11.3572 3.06273 11 2.77943L10.932 2.72546C10.4614 2.35223 10.2261 2.16562 9.96953 2.08178C9.66458 1.98214 9.33542 1.98214 9.03047 2.08178C8.7739 2.16562 8.53862 2.35223 8.06805 2.72546Z"/><path d="M8 12H16"/><path d="M8 8H12"/><path d="M8 16H16"/></svg>',
    catalog:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 22V14C7 12.1144 7 11.1716 7.58579 10.5858C8.17157 10 9.11438 10 11 10H13C14.8856 10 15.8284 10 16.4142 10.5858C17 11.1716 17 12.1144 17 14V22H7Z"/><path d="M7 14H17"/><path d="M7 18H17"/><path d="M18.1287 5.23204L15.1287 3.39725C13.6056 2.46575 12.8441 2 12 2C11.1559 2 10.3944 2.46575 8.8713 3.39725L5.8713 5.23204C4.46832 6.0901 3.76683 6.51912 3.38341 7.20331C3 7.8875 3 8.71027 3 10.3558V15.9952C3 18.8259 3 20.2412 3.87868 21.1206C4.75736 22 6.17157 22 9 22H15C17.8284 22 19.2426 22 20.1213 21.1206C21 20.2412 21 18.8259 21 15.9952V10.3558C21 8.71027 21 7.8875 20.6166 7.20331C20.2332 6.51912 19.5317 6.0901 18.1287 5.23204Z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.00449 12.5V12M18.0045 12.5V12M12.0045 12.5V12M7.00449 12.5C7.00449 11.9477 6.55677 11.5 6.00449 11.5C5.4522 11.5 5.00449 11.9477 5.00449 12.5C5.00449 13.0523 5.4522 13.5 6.00449 13.5C6.55677 13.5 7.00449 13.0523 7.00449 12.5ZM19.0045 12.5C19.0045 11.9477 18.5568 11.5 18.0045 11.5C17.4522 11.5 17.0045 11.9477 17.0045 12.5C17.0045 13.0523 17.4522 13.5 18.0045 13.5C18.5568 13.5 19.0045 13.0523 19.0045 12.5ZM13.0045 12.5C13.0045 11.9477 12.5568 11.5 12.0045 11.5C11.4522 11.5 11.0045 11.9477 11.0045 12.5C11.0045 13.0523 11.4522 13.5 12.0045 13.5C12.5568 13.5 13.0045 13.0523 13.0045 12.5Z"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17 17L21 21"/><path d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.0092 2V5.13219C20.0092 5.42605 19.6418 5.55908 19.4537 5.33333C17.6226 3.2875 14.9617 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9"/></svg>',
  }

  function dockTab(icon, name, screen, current = false) {
    return `<button type="button" data-screen="${screen}" ${current ? 'aria-current="page"' : ""}>${icons[icon]}<span>${name}</span></button>`
  }

  function dock(active = "(admin-tabs)/admin-home") {
    return `${dockTab("home", "Home", "(admin-tabs)/admin-home", active === "(admin-tabs)/admin-home")}
      ${dockTab("orders", "Orders", "(admin-tabs)/orders")}
      <button type="button" data-action="open-sheet" class="dock-create" aria-label="Create">${icons.plus}</button>
      ${dockTab("catalog", "Catalog", "(admin-tabs)/catalog", active === "(admin-tabs)/catalog")}
      ${dockTab("more", "More", "(admin-tabs)/more")}`
  }

  function quickActions() {
    return `<div class="home-actions" aria-label="Quick actions">
      <button type="button" data-screen="create-sale-modal"><span class="home-action-tile">${icons.plus}</span>New sale</button>
      <button type="button" data-action="open-sheet"><span class="home-action-tile">${icons.package}</span>Add item</button>
      <button type="button" data-screen="payments-received-modal"><span class="home-action-tile">${icons.wallet}</span>Payment</button>
      <button type="button" data-screen="stock-intake-modal"><span class="home-action-tile">${icons.download}</span>Stock in</button>
    </div>`
  }

  function assistant(questions) {
    if (!questions) return ""
    return `<button type="button" class="ask" data-screen="ask-assistant"><span class="ask-icon">${icons.sparkles}</span> Ask about your business…</button>
      <div class="ask-questions" aria-label="Suggested Assistant questions">
        ${questions
          .slice(0, 3)
          .map(
            (question) =>
              `<button type="button" data-screen="ask-assistant">${question}</button>`,
          )
          .join("")}
      </div>`
  }

  const ordersScreen = "(admin-tabs)/orders"
  const sectionTitle = (label, screen) =>
    `<div class="section-title"><h2>${label}</h2>${screen ? `<button class="text-action" type="button" data-screen="${screen}">See all</button>` : ""}</div>`
  const action = (label, screen) =>
    `<button type="button" class="home-outline" data-screen="${screen}">${label}</button>`
  const localAction = (label, target, disabled = false) =>
    `<button type="button" class="home-outline" data-action="${target}" ${disabled ? "disabled" : ""}>${label}</button>`
  const banner = (message, title = "", content = "") =>
    `<div class="callout home-banner">${title ? `<strong>${title}</strong>` : ""}<p>${message}</p>${content}</div>`
  const skeleton = (type, label) =>
    `<div class="home-skeleton home-skeleton--${type}" role="status" aria-label="${label}"></div>`

  function recentOrders(fixture) {
    const heading = sectionTitle("Recent orders", ordersScreen)
    if (fixture.recent === "loading")
      return heading + skeleton("rows", "Loading recent orders")
    if (fixture.recent === "unavailable")
      return (
        heading +
        banner("Recent orders could not load. Pull down to try again.")
      )
    if (!fixture.rows.length)
      return heading + banner("Orders you record will appear here.")
    const rows = fixture.rows
      .map(
        ({ customer, avatar, pill, amount, meta }) =>
          `<button type="button" class="record home-order" data-screen="order/[orderId]">
        <span class="home-order-avatar" data-tint="${avatar.tint}" aria-hidden="true">${avatar.icon ? icons.store : avatar.initials}</span>
        <span class="home-order-name"><b>${customer}</b><small>${meta}</small></span>
        <span class="home-order-payment"><b>${amount}</b><span class="home-order-pill" data-tone="${pill.tone}">${pill.label}</span></span>
      </button>`,
      )
      .join("")
    return `${heading}<div class="records home-orders">${rows}</div>`
  }

  function salesHero(fixture) {
    if (fixture.sales === "loading")
      return skeleton("hero", "Loading today’s sales")
    const status = fixture.offline
      ? "Offline"
      : fixture.pending
        ? `${fixture.pending} waiting`
        : "Synced"
    const tone = fixture.offline ? "offline" : fixture.pending ? "waiting" : ""
    const unavailable = fixture.sales === "unavailable"
    const zero = fixture.sales === "zero"
    const cached = fixture.sales === "cached"
    return `<section class="hero" aria-label="Today’s sales">
      <div class="hero-row"><span>Today’s sales${cached ? " · as of 9:41" : ""}</span><span class="hero-pill ${tone}">${status}</span></div>
      <h2>${unavailable ? "—" : zero ? "₦0" : "₦146,000"}</h2>
      <p>${unavailable ? "Sales are unavailable right now. Pull down to try again." : `${cached ? "Cached figures · " : ""}${fixture.soldToday} orders${fixture.sales === "partial" ? " (partial)" : ""}`}</p>
      ${
        unavailable
          ? ""
          : `<div class="metric-row">
        <div><span>Paid</span><b>${zero ? "₦0" : "₦121,500"}</b></div>
        <div><span>Unpaid</span><b>${zero ? "₦0" : "₦24,500"}</b></div>
        <div><span>Items sold</span><b>${zero ? "0" : "9"}</b></div>
      </div>`
      }
    </section>`
  }

  function attention(fixture) {
    if (fixture.offline || fixture.attention === "none") return ""
    const unpaid = [
      "wallet",
      "amber",
      "1 unpaid order",
      "₦24,500 to collect",
      ordersScreen,
    ]
    const entries =
      fixture.attention === "all"
        ? [
            [
              "approval",
              "rose",
              "2 approvals waiting",
              "Returns and refunds to decide",
              "change-approvals-modal",
            ],
            unpaid,
            [
              "delivery",
              "sky",
              "3 orders to deliver",
              "Ready or on the way",
              ordersScreen,
            ],
          ]
        : [unpaid]
    return `<div class="section-title"><h2>Needs attention</h2><span class="home-attention-count">${entries.length}</span></div>
      <div class="attention-rail">
        ${entries
          .map(
            ([
              icon,
              tint,
              title,
              description,
              screen,
            ]) => `<button class="attention-card" type="button" data-tint="${tint}" data-screen="${screen}">
          <span class="attention-icon">${icons[icon]}</span><span><strong>${title}</strong><small>${description}</small></span>
        </button>`,
          )
          .join("")}
      </div>`
  }

  function paymentNotifications(fixture) {
    if (fixture.offline || !fixture.payments) return ""
    return `${sectionTitle("Payments to check", "payments-to-check-modal")}<div class="home-card home-payment">
        <span class="home-order-avatar" data-tint="amber">${icons.bank}</span>
        <div><strong>Tomi Bello reported ₦32,000 paid</strong><p>10 min ago · not recorded yet</p>
          <div class="home-actions-inline">${action("Open", "order/[orderId]")}${action("Evaluate", "payment-report/[reportId]")}</div>
        </div>
      </div>`
  }

  function teamNudge(fixture, dismissed) {
    if (fixture.team === "hidden" || dismissed) return ""
    return `<div class="home-card home-team" data-tint="lilac">
      <span class="home-order-avatar" data-tint="lilac">${icons.team}</span>
      <span><strong>Invite your team</strong><small>Optional · let staff record sales</small></span>
      ${action("Invite", "staff-invite-modal")}
    </div>
    <div class="home-team-dismiss">${localAction(fixture.team === "saving" ? "Saving…" : "I work on my own", "dismiss-team", fixture.team === "saving")}</div>
    ${fixture.team === "error" ? '<p class="home-error" role="alert">Couldn’t save your preference. Try again.</p>' : ""}`
  }

  function setupHome(fixture, business) {
    const first = fixture.stage === "first-order"
    const items = ["Canvas tote", "Storage basket", "Cotton towel"]
    return `<section class="hero setup">
      <div class="hero-row"><span>Getting started · ${first ? 1 : 0} of 2</span><span class="hero-pill ${fixture.offline ? "offline" : ""}">${fixture.offline ? "Offline" : "Synced"}</span></div>
      <h2>${first ? "You’re ready for your first customer" : `Let’s get ${business} selling`}</h2>
      <p>${first ? "Your catalog is set. Record your first sale to start tracking money in." : "Two essentials and you can take your first order."}</p>
      <div class="setup-progress" aria-hidden="true"><span data-complete="${first}"></span><span></span></div>
      <button type="button" class="primary-action" ${first ? 'data-screen="create-sale-modal"' : 'data-action="open-sheet"'}>${first ? "Take your first order" : "Add an item or service"}</button>
    </section>
    ${!first && fixture.setupAssistant && !fixture.offline ? `<div class="home-setup-ai">${action("Set up with AI", "setup-assistant")}</div>` : ""}
    <div class="records home-setup-steps">
      <button type="button" class="record" data-action="open-sheet" ${first ? "disabled" : ""}><span class="item-icon">${first ? "✓" : "1"}</span><span><b>Add what you sell</b><small>${first ? fixture.catalogStep : "An item or service with a price"}</small></span><span aria-hidden="true">›</span></button>
      <button type="button" class="record" data-screen="create-sale-modal"><span class="item-icon">2</span><span><b>Take your first order</b><small>${first ? "Takes about a minute" : "Pick catalog items or type a price"}</small></span><span aria-hidden="true">›</span></button>
      ${fixture.role !== "MANAGER" ? '<button type="button" class="record" data-screen="staff-invite-modal"><span class="item-icon">+</span><span><b>Invite your team</b><small>Optional · do it any time</small></span><span aria-hidden="true">›</span></button>' : ""}
    </div>
    ${
      first && fixture.catalogLoaded
        ? `${sectionTitle("Your catalog", "catalog-items-modal")}<div class="home-catalog-rail">${items.map((item, index) => `<button class="home-card" type="button" data-screen="catalog-item/[catalogItemId]"><span data-tint="${["mint", "sky", "amber"][index]}">${icons.package}</span><b>${item}</b><small>${["₦12,500", "₦24,500", "₦7,500"][index]} · In stock</small></button>`).join("")}</div>`
        : ""
    }
    ${paymentNotifications(fixture)}
    <div class="home-ghost">Today’s sales will appear here after your first order.</div>`
  }

  function shareStore(fixture, workspace) {
    if (fixture.role === "MANAGER" || fixture.tenant === "loading") return ""
    if (fixture.tenant === "unavailable")
      return banner(
        "Connect to load your store link.",
        "",
        localAction("Try again", "retry-home"),
      )
    const names =
      workspace === 0
        ? ["Canvas tote", "Storage basket", "Cotton towel"]
        : ["Wash and fold", "Dry cleaning", "Alterations"]
    const slug = workspace === 0 ? "ayo-general-store" : "ayo-services"
    const limited = fixture.sharePlan.limits.storefrontItems !== null
    return `<section class="home-card home-share" aria-label="Share your store">
      <header><strong>Share your store</strong><span>${fixture.sharePlan.name}</span></header>
      <span class="home-store-link">${slug}.ewatrade.com</span>
      <p>${limited ? "Your first 3 items show. Upgrade to list everything and let customers message you." : "Everything you list can show here. Customer messages are included once your store chat is set up."}</p>
      ${
        limited
          ? `<div class="home-store-items" aria-label="Your first three storefront items">
        ${names.map((name, index) => `<span>${fixture.preview === "loaded" ? name : fixture.offline ? "Connect to preview items" : fixture.preview === "loading" ? "Loading items…" : fixture.preview === "unavailable" ? "Preview unavailable" : `Item ${index + 1} · add what you sell`}</span>`).join("")}
      </div>`
          : ""
      }
      ${localAction("Share store link", "share-store")}
      <p role="status" data-share-preview hidden>Store link ready to share · ${slug}.ewatrade.com</p>
      ${limited ? action("See plans", "subscription-modal") : ""}
      ${fixture.shareError ? '<p class="home-error" role="alert">Could not open sharing. Copy the store link above and try again.</p>' : ""}
    </section>
    ${fixture.businesses === "unavailable" ? localAction("Retry loading your other businesses", "retry-home") : ""}
    ${
      fixture.businesses === "multiple"
        ? `<section class="home-card home-businesses" aria-label="Your businesses">
      <strong>Your businesses</strong><div><span>Ayo General Store<small>ayo-general-store.ewatrade.com</small></span><b>Ready</b></div>
      <div><span>Ayo Services<small>Waiting for an upgrade</small></span>${action("Upgrade", "subscription-modal")}</div>
      <p>Switch businesses from the top of Home.</p>
    </section>`
        : ""
    }`
  }

  function renderBody(
    fixture,
    { business, workspace, teamDismissed, staffDismissed, staffReviewOpen },
  ) {
    let body
    if (fixture.stage === "loading") {
      body =
        skeleton("hero", "Loading Home") +
        skeleton("tiles", "Loading actions") +
        skeleton("rows", "Loading recent orders")
    } else if (fixture.stage === "blocked") {
      body = fixture.offline
        ? banner(
            "Reconnect to confirm your latest catalog and Store setup.",
            "Store overview unavailable offline",
          )
        : banner(
            "Pull down or try again to load your Store.",
            "Store overview unavailable",
            localAction("Try again", "retry-home"),
          )
    } else if (fixture.stage === "setup" || fixture.stage === "first-order") {
      body = setupHome(fixture, business) + shareStore(fixture, workspace)
    } else {
      body = salesHero(fixture) + assistant(fixture.questions)
      if (fixture.offline || fixture.pending)
        body += banner(
          fixture.offline
            ? "New sales still work. They upload when you reconnect."
            : "They upload in the background.",
          `${fixture.pending} changes waiting to sync`,
          action("View", "sync-status-modal"),
        )
      body +=
        quickActions() +
        attention(fixture) +
        paymentNotifications(fixture) +
        recentOrders(fixture) +
        teamNudge(fixture, teamDismissed) +
        shareStore(fixture, workspace)
    }
    if (fixture.staffReview && !staffDismissed)
      body =
        banner(
          `${business} · What sales reps can see`,
          "Choose what your sales reps can see",
          staffReviewOpen
            ? `<div aria-label="What sales reps can see">
                ${localAction("Only their own sales", "dismiss-staff")}
                ${localAction("All orders in this store", "dismiss-staff")}
              </div>`
            : localAction("Review Staff rules", "review-staff") +
                localAction("Keep as it is", "dismiss-staff"),
        ) + body
    if (fixture.personal)
      body += `<button type="button" class="record personal-conversations" data-screen="(customer)/conversations/index">
        <span class="home-order-avatar" data-tint="sky">${icons.customer}</span>
        <span><b>Personal conversations</b><small>Switch from Business to your private Store inbox</small></span><span aria-hidden="true">›</span>
      </button>`
    return body
  }

  function installPalette(palette) {
    const tokens = ["mint", "sky", "lilac", "amber", "rose"]
    const style = document.createElement("style")
    style.textContent = Object.entries(palette)
      .map(([theme, values]) => {
        const declarations = tokens
          .map(
            (tint) =>
              `--home-${tint}-bg:${values[tint]};--home-${tint}-fg:${values[`${tint}Foreground`]};`,
          )
          .join("")
        return `:root[data-theme="${theme}"]{${declarations}--home-hero-waiting:${values.dotBusy};}`
      })
      .join("")
    document.head.append(style)
  }

  function keepDockVisible(phone, dockElement) {
    const narrow = matchMedia("(max-width: 600px)")
    const edges = new Map()
    let frame = 0

    function update() {
      frame = 0
      if (
        dockElement.hidden ||
        !narrow.matches ||
        document.documentElement.hasAttribute("data-zoom-override")
      )
        return
      const bottom = Math.max(0, ...edges.values())
      if (!bottom) return
      const bounds = phone.getBoundingClientRect()
      const offset = Math.max(12, bounds.bottom - bottom + 12)
      const contained = Math.min(
        offset,
        Math.max(12, bounds.height - dockElement.offsetHeight),
      )
      dockElement.style.setProperty("--dock-visible-bottom", `${contained}px`)
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update)
    }

    // Separate top and bottom probes report movement when the outer Workshop
    // scrolls a frameless preview, even if its total visible height is constant.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          edges.set(
            entry.target,
            entry.isIntersecting ? entry.intersectionRect.bottom : 0,
          )
        }
        schedule()
      },
      { threshold: Array.from({ length: 51 }, (_, index) => index / 50) },
    )

    for (const half of ["top", "bottom"]) {
      const probe = document.createElement("div")
      probe.className = "home-dock-probe"
      probe.dataset.half = half
      probe.setAttribute("aria-hidden", "true")
      document.body.append(probe)
      observer.observe(probe)
    }
    new ResizeObserver(schedule).observe(phone)
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("workshop:zoom-mode", schedule)
    narrow.addEventListener("change", schedule)
    return schedule
  }

  window.MOBILE_PRODUCTION_HOME = {
    renderBody,
    installPalette,
    dock,
    icons,
    keepDockVisible,
    quickActions,
  }
})()
