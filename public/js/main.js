/**
 * L'AURA RESTAURANT - Shared Core Frontend Logic
 * Manages Navigation, Cart Drawer, Live Status, Toasts, and Global Modals
 */

// Cart State Management via LocalStorage
const CartState = {
  getCart() {
    try {
      return JSON.parse(localStorage.getItem('laura_tasting_cart')) || [];
    } catch (e) {
      return [];
    }
  },
  saveCart(cart) {
    localStorage.setItem('laura_tasting_cart', JSON.stringify(cart));
    this.updateBadge();
    this.renderDrawer();
  },
  addItem(item) {
    const cart = this.getCart();
    const existing = cart.find((i) => i.id === item.id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ ...item, qty: 1 });
    }
    this.saveCart(cart);
    showToast(`Added "${item.name}" to Tasting Order`);
  },
  updateQty(id, delta) {
    let cart = this.getCart();
    const item = cart.find((i) => i.id === id);
    if (item) {
      item.qty += delta;
      if (item.qty <= 0) {
        cart = cart.filter((i) => i.id !== id);
      }
      this.saveCart(cart);
    }
  },
  removeItem(id) {
    let cart = this.getCart();
    cart = cart.filter((i) => i.id !== id);
    this.saveCart(cart);
    showToast('Item removed from order');
  },
  getTotal() {
    return this.getCart().reduce((sum, item) => sum + item.price * item.qty, 0);
  },
  getCount() {
    return this.getCart().reduce((sum, item) => sum + item.qty, 0);
  },
  updateBadge() {
    const count = this.getCount();
    const badges = document.querySelectorAll('.cart-count-badge');
    badges.forEach((b) => {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
  },
  renderDrawer() {
    const container = document.getElementById('drawerItemsContainer');
    const totalEl = document.getElementById('drawerTotalAmount');
    if (!container || !totalEl) return;

    const cart = this.getCart();
    if (cart.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; opacity: 0.6;">
            <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <p style="font-size: 1.05rem; font-weight: 500; color: var(--text-primary); margin-bottom: 0.25rem;">Your Tasting Order is Empty</p>
          <p style="font-size: 0.875rem;">Explore our dining menu to curate dishes for your visit.</p>
          <a href="/menu" class="btn btn-primary btn-sm" style="margin-top: 1.25rem;">Browse Menu</a>
        </div>
      `;
      totalEl.textContent = '$0.00';
      return;
    }

    container.innerHTML = cart
      .map(
        (item) => `
      <div class="drawer-item-card">
        <img src="${item.image || '/images/sea_bass.jpg'}" alt="${item.name}" class="drawer-item-img">
        <div class="drawer-item-info">
          <h4 class="drawer-item-title">${item.name}</h4>
          <div class="drawer-item-price">$${item.price} each</div>
          <div class="drawer-qty-controls">
            <button class="qty-btn" onclick="CartState.updateQty('${item.id}', -1)" aria-label="Decrease quantity">−</button>
            <span style="font-weight: 600; font-size: 0.9rem; min-width: 20px; text-align: center;">${item.qty}</span>
            <button class="qty-btn" onclick="CartState.updateQty('${item.id}', 1)" aria-label="Increase quantity">+</button>
            <button onclick="CartState.removeItem('${item.id}')" style="margin-left: auto; color: var(--text-muted); font-size: 0.8rem; text-decoration: underline;">Remove</button>
          </div>
        </div>
      </div>
    `
      )
      .join('');

    totalEl.textContent = `$${this.getTotal().toFixed(2)}`;
  }
};

// Global Toast Manager
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;">
      ${
        type === 'success'
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--status-open)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-terracotta)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      }
    </span>
    <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary); flex-grow: 1;">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Drawer Toggle
function toggleCartDrawer(open) {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;

  if (open !== undefined) {
    drawer.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
  } else {
    drawer.classList.toggle('open');
    overlay.classList.toggle('open');
  }

  if (drawer.classList.contains('open')) {
    CartState.renderDrawer();
  }
}

// Live Status Fetcher
async function fetchLiveStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();
    const badgeEl = document.getElementById('liveStatusBadge');
    if (badgeEl) {
      badgeEl.className = `live-badge ${data.isOpen ? 'open' : 'closed'}`;
      badgeEl.innerHTML = `
        <span class="status-dot"></span>
        <span>${data.statusText}</span>
      `;
    }
  } catch (err) {
    console.warn('Status fetch skipped:', err);
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  // Mobile Nav Toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
    });
  }

  // Header scroll state
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header?.classList.add('header-scrolled');
    } else {
      header?.classList.remove('header-scrolled');
    }
  });

  // Cart Drawer triggers
  const cartToggleBtns = document.querySelectorAll('.cart-toggle-btn');
  cartToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => toggleCartDrawer(true));
  });

  const drawerCloseBtn = document.getElementById('drawerCloseBtn');
  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', () => toggleCartDrawer(false));
  }

  const drawerOverlay = document.getElementById('drawerOverlay');
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', () => toggleCartDrawer(false));
  }

  // Newsletter Form Handler
  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input[type="email"]');
      if (!input || !input.value) return;

      try {
        const res = await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: input.value.trim() })
        });
        const json = await res.json();
        if (res.ok) {
          showToast(json.message, 'success');
          input.value = '';
        } else {
          showToast(json.error || 'Failed to subscribe', 'info');
        }
      } catch (err) {
        showToast('Thank you for subscribing to L\'AURA Cellar Notes!', 'success');
        input.value = '';
      }
    });
  }

  // Initialize Badges and Status
  CartState.updateBadge();
  fetchLiveStatus();
});
