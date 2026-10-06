import { directions, scenarios, defaultPerson, renderEmail } from './design.js'

const $ = id => document.getElementById(id)
let selected = '06'
let size = 'desktop'
const favorites = new Set()
const cards = new Map()
let lastActionCleanup
let downloadUrl

const scenarioSelect = $('scenario')
for (const m of scenarios()) {
  const option = document.createElement('option')
  option.value = m.id
  option.textContent = m.name
  scenarioSelect.append(option)
}
function currentMessage() {
  return scenarios({ name: $('person').value || defaultPerson.name, email: $('email').value || defaultPerson.email }).find(m => m.id === scenarioSelect.value)
}
function fitCards() {
  for (const { area } of cards.values()) area.style.setProperty('--scale', Math.min(1, area.clientWidth / 440))
}
function clearAction() {
  $('action-result').hidden = true
  $('action-result').textContent = ''
  if (lastActionCleanup) lastActionCleanup()
  lastActionCleanup = undefined
}
function bindLocalLinks() {
  const frame = $('large-preview')
  const doc = frame.contentDocument
  if (!doc) return
  // Fit the whole email so longer notices do not acquire a nested scrollbar.
  frame.style.height = `${Math.ceil(doc.body.scrollHeight) + 2}px`
  const onClick = e => {
    const a = e.target.closest('a')
    if (!a) return
    e.preventDefault()
    const result = $('action-result')
    result.hidden = false
    result.textContent = a.getAttribute('href') === '#preview-action' ? `Preview only: “${currentMessage().action}” was selected. No request was made.` : 'Preview only: support links do not leave this workshop.'
  }
  doc.addEventListener('click', onClick)
  lastActionCleanup = () => doc.removeEventListener('click', onClick)
}
$('large-preview').addEventListener('load', bindLocalLinks)
function updateViewer() {
  const d = directions.find(d => d.id === selected)
  const m = currentMessage()
  clearAction()
  $('view-id').textContent = `${d.id} / ${d.tag.toUpperCase()}`
  $('view-title').textContent = d.name
  $('view-description').textContent = d.description
  $('blend').hidden = selected !== '06'
  $('subject').textContent = `Subject: ${m.subject}`
  $('large-preview').title = `${d.name}: ${m.name}`
  $('large-preview').srcdoc = renderEmail(d,m)
  $('stage').classList.toggle('mobile',size === 'mobile')
  $('desktop').setAttribute('aria-pressed', String(size === 'desktop'))
  $('mobile').setAttribute('aria-pressed', String(size === 'mobile'))
  if(downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = URL.createObjectURL(new Blob([renderEmail(d,m)], {type:'text/html'}))
  $('download').href = downloadUrl
  $('download').download = `${d.id}-${m.id}.html`
  $('feedback').textContent = favorites.size ? `Your favorites: ${[...favorites].sort().map(id => `${id} ${directions.find(d => d.id === id).name}`).join(', ')}. Preview feedback only.` : 'Favorites do not change the production design.'
}
function refresh() {
  const m = currentMessage()
  for(const d of directions) cards.get(d.id).frame.srcdoc = renderEmail(d,m)
  updateViewer()
  fitCards()
}
function select(id,scroll = true) {
  selected = id
  updateViewer()
  history.replaceState(null,'',`#direction-${id}`)
  if(scroll) $('recommended').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})
}
for(const d of directions) {
  const article = document.createElement('article')
  article.className = 'direction' + (d.id === '06' ? ' recommended' : '')
  article.id = `sample-${d.id}`
  const top = document.createElement('div')
  top.className = 'card-top'
  const number = document.createElement('span'); number.className='number'; number.textContent=d.id
  const heading = document.createElement('div')
  const h = document.createElement('h2'); h.textContent=d.name
  const tag = document.createElement('p'); tag.textContent=d.tag
  heading.append(h,tag);top.append(number,heading)
  const area = document.createElement('div');area.className='preview-area';area.setAttribute('aria-hidden','true')
  const frame = document.createElement('iframe');frame.title=`${d.name} comparison preview`;frame.setAttribute('sandbox','');frame.tabIndex=-1;area.append(frame)
  const caption = document.createElement('div');caption.className='caption'
  const text = document.createElement('p');text.textContent=d.description
  const actions = document.createElement('div');actions.className='card-actions'
  const open = document.createElement('a');open.href=`#direction-${d.id}`;open.textContent='Open full size ↗';open.addEventListener('click', e=>{e.preventDefault();select(d.id)})
  const favorite = document.createElement('button');favorite.type='button';favorite.textContent='Save favorite';favorite.setAttribute('aria-pressed','false');favorite.setAttribute('aria-label',`Save ${d.name} as a favorite`)
  favorite.addEventListener('click',()=>{favorites.has(d.id) ? favorites.delete(d.id) : favorites.add(d.id);favorite.classList.toggle('favorite',favorites.has(d.id));favorite.setAttribute('aria-pressed',String(favorites.has(d.id)));favorite.textContent=favorites.has(d.id)?'Favorite saved ✓':'Save favorite';updateViewer()})
  actions.append(open,favorite);caption.append(text,actions);article.append(top,area,caption);$('gallery').append(article);cards.set(d.id,{area,frame,favorite})
}
$('controls').addEventListener('submit',e=>e.preventDefault())
scenarioSelect.addEventListener('change',refresh)
$('person').addEventListener('input',refresh)
$('email').addEventListener('input',refresh)
$('desktop').addEventListener('click',()=>{size='desktop';updateViewer()})
$('mobile').addEventListener('click',()=>{size='mobile';updateViewer()})
$('reset').addEventListener('click',()=>{
  favorites.clear();selected='06';size='desktop';scenarioSelect.value='waitlist-admin';$('person').value=defaultPerson.name;$('email').value=defaultPerson.email
  for(const {favorite} of cards.values()){favorite.classList.remove('favorite');favorite.setAttribute('aria-pressed','false');favorite.textContent='Save favorite'}
  history.replaceState(null,'',location.pathname);refresh()
})
window.addEventListener('resize',fitCards)
window.addEventListener('hashchange',()=>{const id = location.hash.match(/^#direction-(0[1-6])$/)?.[1];if(id)select(id)})
const initial = location.hash.match(/^#direction-(0[1-6])$/)?.[1]
if(initial)selected=initial
refresh()
if(initial)$('recommended').scrollIntoView()
