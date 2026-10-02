'use strict';

const retainedPhoneFocus = new WeakMap();
const retainedFocusAttributes = ['data-action', 'data-value', 'data-field', 'aria-label'];

function retainedFocusIdentity(element) {
  const attributes = retainedFocusAttributes
    .filter(name => element.hasAttribute(name))
    .map(name => [name, element.getAttribute(name)]);
  return attributes.length ? {tag: element.tagName, attributes} : null;
}

function restoreRetainedFocus(phone, identity) {
  const target = identity && [...phone.querySelectorAll('button,input,textarea,select')]
    .find(element => element.tagName === identity.tag &&
      identity.attributes.every(([name, value]) => element.getAttribute(name) === value));
  const fallback = phone.querySelector('.app-head h3');
  if (target && !target.disabled) target.focus({preventScroll: true});
  else if (fallback) {
    fallback.tabIndex = -1;
    fallback.focus({preventScroll: true});
  }
}

// Keep parent phones and their scroll containers mounted below focused editors.
function renderRetainedPhone(host, screen, markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  if (host.firstElementChild && host.firstElementChild.dataset.id !== next.dataset.id)
    host.replaceChildren();
  const frames = [...host.children];
  const previous = frames.find(phone => phone.dataset.active === 'true');
  const ownsFocus = previous?.contains(document.activeElement) ?? false;
  if (ownsFocus)
    retainedPhoneFocus.set(previous, retainedFocusIdentity(document.activeElement));
  let current = frames.find(phone => phone.dataset.screen === screen);
  if (current) {
    for (const phone of frames.slice(frames.indexOf(current) + 1)) phone.remove();
    const content = current.querySelector('.app-content');
    const scrollTop = content.scrollTop;
    for (const selector of ['.app-head', '.app-content', '.app-foot'])
      current.querySelector(selector).replaceChildren(...next.querySelector(selector).childNodes);
    content.scrollTop = scrollTop;
  } else {
    current = next;
    current.dataset.screen = screen;
    host.append(current);
  }
  host.classList.add('retained-phone-stack');
  for (const phone of host.children) {
    const active = phone === current;
    phone.dataset.active = String(active);
    phone.inert = !active;
    phone.setAttribute('aria-hidden', String(!active));
  }
  // Only the host used for this interaction may move focus. The board and larger
  // preview share a draft but must not steal focus from each other.
  if (ownsFocus) restoreRetainedFocus(current, retainedPhoneFocus.get(current));
}

function resetRetainedPhones(hosts) {
  for (const host of hosts) host.replaceChildren();
}
