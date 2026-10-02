'use strict';

// Workshop presentation keyed to the existing vocabulary. Custom labels have a
// neutral fallback; emojis never identify, authorize or create a category.
const CATEGORY_EMOJIS = Object.freeze({
  poultry: '🐔', 'animal-feed': '🌾', 'farm-supplies': '🚜', 'fresh-produce': '🥬',
  groceries: '🛒', 'drinks-water': '🥤', 'bakery-prepared-food': '🥖', clothing: '👕',
  'footwear-accessories': '👟', 'fabrics-sewing': '🧵', 'beauty-personal-care': '🧴',
  'health-wellness': '🩺', electronics: '📱', 'hardware-building': '🔨',
  'home-household': '🏠', 'spare-parts': '⚙️', 'tailoring-services': '✂️',
  'beauty-services': '💇', 'clothing-care': '🧺', 'repair-services': '🔧',
  'food-services': '🍽️', 'professional-services': '💼',
});
const CATEGORY_CHILD_EMOJIS = Object.freeze({
  poultry: ['🥚', '🐔', '🍗', '🐣'], 'animal-feed': ['🌾', '🐟', '🐄', '🐾'],
  'farm-supplies': ['🌱', '🌿', '🪏', '📦'], 'fresh-produce': ['🥕', '🍎', '🥔', '🌿'],
  groceries: ['🌾', '🧂', '🥫', '🍿'], 'drinks-water': ['💧', '🥤', '🧃', '☕'],
  'bakery-prepared-food': ['🍞', '🎂', '🥐', '🍱'], clothing: ['👗', '👔', '🧒', '🦺'],
  'footwear-accessories': ['👟', '👜', '💍', '🧢'], 'fabrics-sewing': ['🧶', '🧵', '📐', '✂️'],
  'beauty-personal-care': ['💇', '🧴', '💄', '🧼'], 'health-wellness': ['🩺', '🌿', '🩹', '🦽'],
  electronics: ['📱', '💻', '🎧', '🔌'], 'hardware-building': ['🔨', '💡', '🚰', '🧱'],
  'home-household': ['🧹', '🍳', '🛏️', '🪑'], 'spare-parts': ['🚗', '🔌', '📱', '⚙️'],
  'tailoring-services': ['🪡', '📏', '🧵', '🌸'], 'beauty-services': ['💇', '💅', '🧴', '🧖'],
  'clothing-care': ['🧺', '👔', '♨️', '🧼'], 'repair-services': ['📱', '🔌', '🚗', '🏠'],
  'food-services': ['🍽️', '🍱', '🎉', '🧁'], 'professional-services': ['💬', '🎨', '🎓', '📋'],
});
const CATEGORY_EMOJI_BY_KEY = new Map();
for (const root of CatalogCategories.CATALOG_CATEGORY_CONFIG.categories) {
  CATEGORY_EMOJI_BY_KEY.set(root.key, CATEGORY_EMOJIS[root.key] || '🏷️');
  root.subcategories.forEach((child, index) => CATEGORY_EMOJI_BY_KEY.set(child.key, CATEGORY_CHILD_EMOJIS[root.key]?.[index] || CATEGORY_EMOJIS[root.key] || '🏷️'));
}
function categoryEmoji(key) { return CATEGORY_EMOJI_BY_KEY.get(key) || '🏷️'; }
function categorySummaryRow(s) {
  return `<button class="row" data-action="categories"><span class="rowicon category-emoji" aria-hidden="true">${categoryEmoji(s.subcategoryKey || s.categoryKey)}</span><span class="rowcopy"><b>Category</b><small>${esc(categoryPath(s))}</small></span><span class="${s.categoryKey ? 'done' : 'arrow'}">${s.categoryKey ? '✓' : '›'}</span></button>`;
}
