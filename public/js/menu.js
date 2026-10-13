/**
 * L'AURA RESTAURANT - Menu Page Interactive Logic
 * Features: Live search, category filtering, dietary tag filtering, dish detail modal
 */

let allMenuItems = [];
let currentCategory = 'all';
let activeDietary = 'all';
let searchQuery = '';

async function loadMenuData() {
  const container = document.getElementById('menuGridContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    allMenuItems = data.items || [];
    renderMenu();
  } catch (err) {
    console.error('Error fetching menu:', err);
    if (container) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); grid-column: 1 / -1;">Unable to load menu. Please refresh.</p>`;
    }
  }
}

function filterItems() {
  return allMenuItems.filter((item) => {
    // Category match
    const categoryMatch = currentCategory === 'all' || item.category === currentCategory;

    // Dietary match
    let dietaryMatch = true;
    if (activeDietary !== 'all') {
      dietaryMatch = (item.tags || []).some(
        (t) => t.toLowerCase() === activeDietary.toLowerCase()
      ) || (item.badge || '').toLowerCase().includes(activeDietary.toLowerCase());
    }

    // Search query match
    let searchMatch = true;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      searchMatch =
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(q));
    }

    return categoryMatch && dietaryMatch && searchMatch;
  });
}

function renderMenu() {
  const container = document.getElementById('menuGridContainer');
  const countEl = document.getElementById('menuItemCount');
  if (!container) return;

  const items = filterItems();

  if (countEl) {
    countEl.textContent = `Showing ${items.length} culinary creation${items.length === 1 ? '' : 's'}`;
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background-color: var(--bg-surface); border: 1px dashed var(--border-medium); border-radius: var(--radius-md);">
        <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">No dishes match your selection</h3>
        <p style="margin-bottom: 1.5rem;">Try adjusting your dietary filter or search terms.</p>
        <button class="btn btn-outline btn-sm" onclick="resetFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
    <article class="card dish-card" id="dish-${item.id}">
      <div class="dish-media" onclick="openDishModal('${item.id}')" style="cursor: pointer;">
        <img src="${item.image || '/images/sea_bass.jpg'}" alt="${item.name}" loading="lazy">
        ${item.badge ? `<span class="badge badge-terracotta dish-badge-overlay">${item.badge}</span>` : ''}
        <div class="dish-price-tag">$${item.price}</div>
      </div>
      <div class="dish-body">
        <div class="dish-header-row">
          <h3 class="dish-name" onclick="openDishModal('${item.id}')" style="cursor: pointer;">${item.name}</h3>
        </div>
        <p class="dish-description">${item.description}</p>
        
        <div class="dish-meta-tags">
          ${(item.tags || []).map((tag) => `<span class="tag-pill">${tag}</span>`).join('')}
        </div>

        <div class="dish-footer-row">
          <button class="btn btn-ghost btn-sm" onclick="openDishModal('${item.id}')" style="padding-left: 0;">
            <span>Dish Notes</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
          <button class="btn btn-primary btn-sm" onclick="handleAddToCart('${item.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            <span>Add to Tasting</span>
          </button>
        </div>
      </div>
    </article>
  `
    )
    .join('');
}

function handleAddToCart(id) {
  const item = allMenuItems.find((i) => i.id === id);
  if (item) {
    CartState.addItem(item);
  }
}

function openDishModal(id) {
  const item = allMenuItems.find((i) => i.id === id);
  if (!item) return;

  const modal = document.getElementById('dishModal');
  const modalContent = document.getElementById('dishModalDetails');
  if (!modal || !modalContent) return;

  modalContent.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem;">
      <div style="border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-light); aspect-ratio: 16 / 10;">
        <img src="${item.image}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;">
      </div>
      <div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
          <h2 style="font-size: 1.85rem;">${item.name}</h2>
          <span style="font-family: var(--font-serif); font-size: 1.75rem; font-weight: 700; color: var(--accent-terracotta);">$${item.price}</span>
        </div>
        <p style="font-size: 1.05rem; margin-bottom: 1.5rem;">${item.description}</p>
        
        <div style="background-color: var(--bg-surface-alt); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 1.25rem; margin-bottom: 1.5rem;">
          <h4 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-terracotta); margin-bottom: 0.4rem;">Sommelier Wine Pairing</h4>
          <p style="font-size: 0.95rem; color: var(--text-primary); font-weight: 500;">${item.pairing || 'Ask your server for our cellar pairing recommendation.'}</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; border-top: 1px solid var(--border-light); border-bottom: 1px solid var(--border-light); padding: 1rem 0; margin-bottom: 1.5rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Prep Time</div>
            <div style="font-weight: 600; font-size: 0.95rem;">${item.prepTime || '15 mins'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Energy</div>
            <div style="font-weight: 600; font-size: 0.95rem;">${item.calories || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Allergens</div>
            <div style="font-weight: 600; font-size: 0.95rem;">${item.allergens || 'None'}</div>
          </div>
        </div>

        <div style="display: flex; gap: 1rem;">
          <button class="btn btn-primary" style="flex-grow: 1;" onclick="handleAddToCart('${item.id}'); closeDishModal();">
            Add to Tasting Order ($${item.price})
          </button>
          <a href="/reservations" class="btn btn-outline" style="flex-grow: 1;">
            Book Table to Taste
          </a>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('open');
}

function closeDishModal() {
  const modal = document.getElementById('dishModal');
  if (modal) modal.classList.remove('open');
}

function resetFilters() {
  currentCategory = 'all';
  activeDietary = 'all';
  searchQuery = '';

  const searchInput = document.getElementById('menuSearchInput');
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.category-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.category === 'all');
  });

  document.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.dietary === 'all');
  });

  renderMenu();
}

document.addEventListener('DOMContentLoaded', () => {
  loadMenuData();

  // Category buttons
  document.querySelectorAll('.category-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.category-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category || 'all';
      renderMenu();
    });
  });

  // Dietary chips
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeDietary = chip.dataset.dietary || 'all';
      renderMenu();
    });
  });

  // Search input
  const searchInput = document.getElementById('menuSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderMenu();
    });
  }

  // Modal dismiss
  const modal = document.getElementById('dishModal');
  const modalClose = document.getElementById('dishModalClose');
  if (modalClose) modalClose.addEventListener('click', closeDishModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDishModal();
    });
  }

  // Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDishModal();
  });
});
