'use strict';

// Workshop simulation only. A production model must return existing category
// identities from the supplied tree; it must never invent an assignment.
const categorySuggestionTimers = new Map();

function newCategorySuggestionState() {
  return { categorySuggestion: { status: 'idle', request: null, options: [] }, categorySuggestionScenario: 'auto' };
}

function categorySuggestionRequest(s) {
  return {
    title: s.name.trim().replace(/\s+/g, ' '),
    businessType: s.businessProfileKey,
    categoryTrees: [
      ...CatalogCategories.CATALOG_CATEGORY_CONFIG.categories.filter(c => c.itemKinds.includes('product')),
      ...s.customCategoryNodes.filter(c => !c.parentKey),
    ].map(c => ({ key: c.key, label: c.label, subcategories: categoryChildren(s, c.key).map(child => ({ key: child.key, label: child.label })) })),
  };
}

function categorySuggestionSignature(s) {
  return JSON.stringify([categorySuggestionRequest(s), s.categorySuggestionScenario]);
}

function invalidateCategorySuggestion(id, s) {
  clearTimeout(categorySuggestionTimers.get(id));
  categorySuggestionTimers.delete(id);
  s.categorySuggestion = { status: 'idle', request: null, options: [] };
}

function simulatedCategorySuggestions(request) {
  const title = request.title.toLowerCase();
  let keys = [];
  if (/\bhatching\b.*\beggs?\b/.test(title)) keys = ['poultry:hatching-eggs'];
  else if (/\beggs?\b/.test(title)) keys = ['poultry:eggs'];
  else if (/\b(chicken|poultry|broiler|layer|birds?)\b/.test(title)) {
    if (/\b(feed|pellets?)\b/.test(title)) keys = ['animal-feed:poultry-feed'];
    else if (/\b(live|day.old)\b/.test(title)) keys = ['poultry:live-birds'];
    else if (/\b(dressed|frozen|fresh|meat)\b/.test(title)) keys = ['poultry:dressed-poultry'];
    else keys = request.businessType === 'animal-feed-agricultural-supplies'
      ? ['poultry:live-birds', 'poultry:dressed-poultry']
      : ['poultry:dressed-poultry', 'poultry:live-birds'];
  } else if (/\b(rice|flour|grain|maize)\b/.test(title)) keys = ['groceries:grains-flour'];
  else if (/\b(t.shirt|shirt|trousers)\b/.test(title)) keys = ['clothing:menswear', 'clothing:womenswear'];
  else if (/\b(phone|iphone|smartphone)\b/.test(title)) keys = ['electronics:phones'];
  else if (/\bwater\b/.test(title)) keys = ['drinks-water:drinking-water'];

  const options = request.categoryTrees.flatMap(root => [
    { categoryKey: root.key, subcategoryKey: null, label: root.label },
    ...root.subcategories.map(child => ({ categoryKey: root.key, subcategoryKey: child.key, label: child.label })),
  ]);
  if (keys.length) return keys.map(key => options.find(o => o.subcategoryKey === key)).filter(Boolean);

  // Sample label matching makes merchant-created vocabulary reviewable too.
  const matches = options.filter(o => title.includes(o.label.toLowerCase()));
  const children = matches.filter(o => o.subcategoryKey);
  return (children.length ? children : matches).slice(0, 3);
}

function categorySuggestionsSection(s) {
  const suggestion = s.categorySuggestion;
  if (!suggestion || !['ready','applied'].includes(suggestion.status) || !suggestion.options.length || suggestion.signature !== categorySuggestionSignature(s)) return '';
  return `<section class="category-ai-section" aria-label="Category suggestions"><p class="sectionlabel">Suggestions</p><p class="screen-copy">Choose a match, or browse categories below.</p>${suggestion.options.map((option, index) => {
    const parent = categoryNode(s, option.categoryKey);
    const child = categoryChildren(s, option.categoryKey).find(c => c.key === option.subcategoryKey);
    const selected=s.categoryKey===option.categoryKey&&s.subcategoryKey===option.subcategoryKey;
    return `<button class="row category-ai-option" data-action="apply-category-suggestion" data-value="${index}" aria-label="Use ${esc(categoryPath(s, option.categoryKey, option.subcategoryKey))}"><span class="rowicon category-emoji" aria-hidden="true">${categoryEmoji(child?.key || parent.key)}</span><span class="rowcopy"><b>${esc(child?.label || parent.label)}</b><small>${esc(parent.label)}${child ? ' › '+esc(child.label) : ''}</small>${index === 0 ? '<span class="category-ai-best">Best match</span>' : ''}</span><span class="${selected?'done':'arrow'}" aria-hidden="true">${selected?'✓':'›'}</span></button>`;
  }).join('')}</section>`;
}

function refreshCategorySuggestion(id) {
  document.querySelectorAll(`[data-host="${id}"] [data-category-ai-results]`).forEach(region=>{region.innerHTML=categorySuggestionsSection(states.get(id));});
}

function requestCategorySuggestion(id, force = false) {
  const s = states.get(id);
  if (id !== '02') return;
  const request = categorySuggestionRequest(s), signature = categorySuggestionSignature(s);
  if (!request.title) {
    invalidateCategorySuggestion(id, s);
    refreshCategorySuggestion(id);
    return;
  }
  if (!force && s.categorySuggestion.signature === signature && s.categorySuggestion.status !== 'dismissed') return;
  invalidateCategorySuggestion(id, s);
  s.categorySuggestion = { status: 'loading', request, signature, options: [] };
  const pending = s.categorySuggestion;
  refreshCategorySuggestion(id);
  categorySuggestionTimers.set(id, setTimeout(() => {
    categorySuggestionTimers.delete(id);
    if (states.get(id) !== s || s.categorySuggestion !== pending || categorySuggestionSignature(s) !== signature) return;
    const options = s.categorySuggestionScenario === 'empty' ? [] : simulatedCategorySuggestions(request);
    pending.status = s.categorySuggestionScenario === 'error' ? 'error' : options.length ? 'ready' : 'empty';
    pending.options = options;
    refreshCategorySuggestion(id);
  }, 850));
}

function categorySuggestionAction(action, button, id, s) {
  if (action !== 'apply-category-suggestion') return false;
  const phone = button.closest('.phone');
  const suggestion = s.categorySuggestion;
  if (!['ready','applied'].includes(suggestion.status) || suggestion.signature !== categorySuggestionSignature(s)) return true;
  const option = suggestion.options[Number(button.dataset.value)];
  if (!option || !categoryNode(s, option.categoryKey) || (option.subcategoryKey && !categoryChildren(s, option.categoryKey).some(c => c.key === option.subcategoryKey))) return true;
  s.categoryKey = option.categoryKey;
  s.subcategoryKey = option.subcategoryKey;
  s.categoryDraftKey = option.categoryKey;
  s.subcategoryDraftKey = option.subcategoryKey;
  suggestion.status = 'applied';
  s.screen = 'main';
  sync(id);
  phone?.querySelector('[data-action="categories"]')?.focus({ preventScroll: true });
  return true;
}

document.addEventListener('focusout', event => {
  if (event.target.matches('[data-field="name"]')) {
    const phone = event.target.closest('.phone');
    if (phone?.dataset.active === 'true') requestCategorySuggestion(phone.dataset.id);
  }
});
