/**
 * Dashboard JavaScript
 * Handles dashboard data display with real API data
 */

// State
let dashboardItems = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadDashboardData();
});

/**
 * Load dashboard data from API
 */
async function loadDashboardData() {
  try {
    // Load stats and items in parallel
    const [statsResult, itemsResult] = await Promise.all([
      loadStats(),
      loadRecentItems()
    ]);

    if (!statsResult || !itemsResult) {
      // API unavailable - stats will show '--' values
      console.log('Dashboard: API unavailable or returned no data');
    }
  } catch (error) {
    console.error('Dashboard load error:', error);
    showToast('Failed to load dashboard data', 'error');
  }
}

/**
 * Load statistics from API
 */
async function loadStats() {
  try {
    if (typeof api === 'undefined') {
      updateStatsOffline();
      return false;
    }

    const response = await api.getDashboardStats();

    if (response.success && response.data) {
      const { totalItems, todayItems, totalGoldWeight, categoryBreakdown } = response.data;

      // Update Total Items
      document.getElementById('statTotalItems').textContent = totalItems.toLocaleString();
      document.getElementById('statTotalItemsChange').textContent = 'Items in database';
      document.getElementById('statTotalItemsChange').className = 'stat-change neutral';

      // Update Today's Items
      document.getElementById('statTodayItems').textContent = todayItems.toLocaleString();
      document.getElementById('statTodayItemsChange').textContent = 'Created today';
      document.getElementById('statTodayItemsChange').className = todayItems > 0 ? 'stat-change positive' : 'stat-change neutral';

      // Update Categories
      const categoryCount = categoryBreakdown ? categoryBreakdown.length : 0;
      document.getElementById('statCategories').textContent = categoryCount.toLocaleString();
      const categoryNames = categoryBreakdown ? categoryBreakdown.map(c => c._id).join(', ') : 'None';
      document.getElementById('statCategoriesChange').textContent = categoryNames || 'No categories yet';

      // Update Gold Weight
      const goldWeightFormatted = totalGoldWeight ? `${totalGoldWeight.toFixed(2)}g` : '0g';
      document.getElementById('statGoldWeight').textContent = goldWeightFormatted;
      document.getElementById('statGoldWeightChange').textContent = 'Across all items';

      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to load stats:', error);
    updateStatsOffline();
    return false;
  }
}

/**
 * Update stats for offline mode
 */
function updateStatsOffline() {
  document.getElementById('statTotalItems').textContent = '--';
  document.getElementById('statTotalItemsChange').textContent = 'API unavailable';
  document.getElementById('statTodayItems').textContent = '--';
  document.getElementById('statTodayItemsChange').textContent = 'API unavailable';
  document.getElementById('statCategories').textContent = '--';
  document.getElementById('statCategoriesChange').textContent = 'API unavailable';
  document.getElementById('statGoldWeight').textContent = '--';
  document.getElementById('statGoldWeightChange').textContent = 'API unavailable';
}

/**
 * Load recent items from API
 */
async function loadRecentItems() {
  try {
    if (typeof api === 'undefined') {
      populateItemsTableOffline();
      return false;
    }

    const response = await api.getRecentItems(10);

    if (response.success && response.data) {
      dashboardItems = response.data;
      populateItemsTable(dashboardItems);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to load items:', error);
    populateItemsTableOffline();
    return false;
  }
}

/**
 * Populate items table with real data
 * Shows both active and deleted items with appropriate styling and actions
 */
function populateItemsTable(items) {
  const tbody = document.getElementById('itemsTableBody');
  const currentUser = typeof auth !== 'undefined' ? auth.getCurrentUser() : null;
  const isAdmin = currentUser && currentUser.role === 'admin';

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
          No items found. <a href="create.html" style="color: var(--color-primary-gold);">Create your first item</a>
        </td>
      </tr>
    `;
    return;
  }

  const rows = items.map(item => {
    const sku = item.sku || 'N/A';
    const name = item.name || item.category?.name || 'Unnamed Item';
    const purity = item.gold?.purity || '-';
    const goldWeight = item.gold?.weight_g ? item.gold.weight_g.toFixed(2) : '0.00';
    const isDeleted = item.deletedAt !== null && item.deletedAt !== undefined;

    // Diamond types: show first letter of each type (e.g., "R, M" for Round, Marquise)
    let diamondTypes = '-';
    if (item.diamonds && item.diamonds.length > 0) {
      diamondTypes = item.diamonds
        .map(d => {
          const typeName = d.type_name || d.type || d.name || 'Unknown';
          return typeName.charAt(0).toUpperCase();
        })
        .join(', ');
    }

    const created = formatDate(item.createdAt);

    // Row styling: faded for deleted items
    const rowClass = isDeleted ? 'class="deleted-row"' : '';
    const rowStyle = isDeleted ? 'style="opacity: 0.5; background: var(--color-gray-50);"' : '';

    // Name with deleted badge if applicable
    const nameDisplay = isDeleted
      ? `${escapeHtml(name)} <span class="deleted-badge" style="font-size: 10px; background: var(--color-error); color: white; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Deleted</span>`
      : escapeHtml(name);

    // Action buttons: show Restore for deleted, Delete for active
    let actionButtons = `
      <button class="btn btn-ghost btn-sm" onclick="viewItem('${sku}')" title="View">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="2"/>
          <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="2"/>
        </svg>
      </button>
      <button class="btn btn-ghost btn-sm" onclick="downloadQR('${sku}')" title="Download QR">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8m0 0L5 7m3 3l3-3M2 13h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    if (isDeleted && isAdmin) {
      // Show Restore button for deleted items (admin only)
      actionButtons += `
        <button class="btn btn-ghost btn-sm btn-success" onclick="restoreItem('${sku}')" title="Restore" style="color: var(--color-success);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 0111.46-2.46M14 8a6 6 0 01-11.46 2.46" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      `;
    } else if (!isDeleted && isAdmin) {
      // Show Delete button for active items (admin only)
      actionButtons += `
        <button class="btn btn-ghost btn-sm btn-danger" onclick="deleteItem('${sku}')" title="Delete">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m1 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4h8z" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      `;
    }

    return `
    <tr data-sku="${sku}" ${rowClass} ${rowStyle}>
      <td><span class="sku-badge">${sku}</span></td>
      <td>${nameDisplay}</td>
      <td>${purity}</td>
      <td class="text-mono">${goldWeight}g</td>
      <td><span class="diamond-types">${diamondTypes}</span></td>
      <td>${created}</td>
      <td>
        <div class="action-buttons">
          ${actionButtons}
        </div>
      </td>
    </tr>
  `;
  }).join('');

  tbody.innerHTML = rows;
}

/**
 * Populate table for offline mode
 */
function populateItemsTableOffline() {
  const tbody = document.getElementById('itemsTableBody');
  tbody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
        Unable to load items. Please check your connection to the API.
      </td>
    </tr>
  `;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Search functionality
  const searchInput = document.querySelector('.search-input');
  searchInput?.addEventListener('input', debounce(handleSearch, 300));

  // View All button - loads all items
  document.getElementById('viewAllBtn')?.addEventListener('click', async () => {
    try {
      showToast('Loading all items...', 'info');
      if (typeof api !== 'undefined') {
        const response = await api.getItems({ limit: 100 });
        if (response.success && response.data) {
          dashboardItems = response.data;
          populateItemsTable(dashboardItems);
          showToast(`Loaded ${dashboardItems.length} items`, 'success');
        }
      }
    } catch (error) {
      console.error('Failed to load all items:', error);
      showToast('Failed to load items', 'error');
    }
  });

  // View Item Modal - Close buttons
  document.getElementById('closeViewModal')?.addEventListener('click', closeViewModal);
  document.getElementById('closeViewModalBtn')?.addEventListener('click', closeViewModal);

  // View Item Modal - Copy SKU
  document.getElementById('copyViewSku')?.addEventListener('click', () => {
    const sku = document.getElementById('viewItemSku').textContent;
    if (sku && sku !== '-') {
      navigator.clipboard.writeText(sku);
      showToast('SKU copied!', 'success');
    }
  });

  // View Item Modal - Download QR
  document.getElementById('downloadQRFromModal')?.addEventListener('click', () => {
    const sku = document.getElementById('viewItemSku').textContent;
    if (sku && sku !== '-') {
      downloadQR(sku);
    }
  });

  // Close modal on backdrop click
  document.getElementById('viewItemModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'viewItemModal') {
      closeViewModal();
    }
  });

  // Logout button
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (typeof auth !== 'undefined') {
      auth.logout();
    }
  });
}

/**
 * View item details in modal
 * Fetches fresh data from API to ensure consistency (same as scan page)
 */
async function viewItem(sku) {
  // Show loading state
  const modal = document.getElementById('viewItemModal');
  const qrContainer = document.getElementById('modalQrCode');
  const qrLabel = document.getElementById('modalQrSkuLabel');

  document.getElementById('viewItemSku').textContent = sku;
  document.getElementById('viewItemName').textContent = 'Loading...';
  document.getElementById('viewItemCategory').textContent = '-';
  document.getElementById('viewItemPurity').textContent = '-';
  document.getElementById('viewItemWeight').textContent = '-';
  document.getElementById('viewItemDiamonds').innerHTML = '<span class="text-muted">Loading...</span>';
  document.getElementById('viewItemCreated').textContent = '-';

  // Clear and show loading for QR
  qrContainer.innerHTML = '<span class="text-muted" style="font-size: 12px;">Loading...</span>';
  qrLabel.textContent = sku;

  modal.classList.remove('hidden');

  try {
    // Fetch fresh data from API (same endpoint as scan page)
    if (typeof api === 'undefined' || !api.getItemBySku) {
      throw new Error('API not available');
    }

    const response = await api.getItemBySku(sku);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Item not found');
    }

    const item = response.data;

    // Populate modal with fresh data
    document.getElementById('viewItemSku').textContent = item.sku || '-';
    document.getElementById('viewItemName').textContent = item.name || 'Unnamed Item';
    document.getElementById('viewItemCategory').textContent = item.category?.name || '-';
    document.getElementById('viewItemPurity').textContent = item.gold?.purity || '-';
    document.getElementById('viewItemWeight').textContent = item.gold?.weight_g ? `${item.gold.weight_g.toFixed(2)}g` : '-';
    document.getElementById('viewItemCreated').textContent = formatDate(item.createdAt);

    // Build diamond list with full details
    const diamondsContainer = document.getElementById('viewItemDiamonds');
    if (item.diamonds && item.diamonds.length > 0) {
      diamondsContainer.innerHTML = item.diamonds.map(d => `
        <div class="diamond-item">
          <span class="diamond-type">${d.type_name || 'Unknown'}</span>
          <span class="diamond-source">${d.source_name || d.source || '-'}</span>
          <span class="diamond-weight">${d.weight_ct ? d.weight_ct.toFixed(2) + ' ct' : '-'}</span>
        </div>
      `).join('');
    } else {
      diamondsContainer.innerHTML = '<span class="text-muted">No diamonds</span>';
    }

    // Display item images
    const imagesContainer = document.getElementById('viewItemImages');
    if (item.images && (item.images.primary || (item.images.gallery && item.images.gallery.length > 0))) {
      const apiBase = 'http://localhost:3000'; // Backend URL for images
      let imagesHtml = '';

      // Primary image
      if (item.images.primary) {
        imagesHtml += `
          <div class="item-image-primary">
            <img src="${apiBase}${item.images.primary}" alt="Primary image" onerror="this.parentElement.style.display='none'">
          </div>
        `;
      }

      // Gallery images
      if (item.images.gallery && item.images.gallery.length > 0) {
        item.images.gallery.forEach((imgPath, i) => {
          imagesHtml += `
            <div class="item-image-gallery">
              <img src="${apiBase}${imgPath}" alt="Gallery image ${i + 1}" onerror="this.parentElement.style.display='none'">
            </div>
          `;
        });
      }

      imagesContainer.innerHTML = imagesHtml;
    } else {
      imagesContainer.innerHTML = '<span class="no-images-placeholder">No images</span>';
    }

    // Generate QR code for the SKU
    generateModalQrCode(item.sku);

  } catch (error) {
    console.error('Failed to load item details:', error);
    document.getElementById('viewItemName').textContent = 'Error loading item';
    document.getElementById('viewItemDiamonds').innerHTML = `<span class="text-error">${error.message}</span>`;
    qrContainer.innerHTML = '<span class="text-error" style="font-size: 12px;">Error</span>';
    showToast('Failed to load item details', 'error');
  }
}

/**
 * Generate QR code for modal preview
 */
function generateModalQrCode(sku) {
  const container = document.getElementById('modalQrCode');
  const label = document.getElementById('modalQrSkuLabel');

  // Clear previous QR
  container.innerHTML = '';
  label.textContent = sku;

  // Check if QRCode library is available
  if (typeof QRCode === 'undefined') {
    container.innerHTML = '<span class="text-muted" style="font-size: 11px;">QR unavailable</span>';
    return;
  }

  try {
    // Generate QR code with SKU only (consistent with create/scan pages)
    QRCode.toCanvas(sku, {
      width: 110,
      margin: 1,
      color: {
        dark: '#1a365d',  // Navy color
        light: '#ffffff'
      }
    }, (error, canvas) => {
      if (error) {
        console.error('QR generation error:', error);
        container.innerHTML = '<span class="text-error" style="font-size: 11px;">QR error</span>';
        return;
      }
      container.appendChild(canvas);
    });
  } catch (err) {
    console.error('QR generation failed:', err);
    container.innerHTML = '<span class="text-muted" style="font-size: 11px;">QR failed</span>';
  }
}

/**
 * Close view item modal
 */
function closeViewModal() {
  document.getElementById('viewItemModal').classList.add('hidden');
}

/**
 * Handle search
 */
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    // Reset to show all
    populateItemsTable(dashboardItems);
    return;
  }

  // Filter items
  const filtered = dashboardItems.filter(item => {
    const sku = (item.sku || '').toLowerCase();
    const name = (item.name || item.category?.name || '').toLowerCase();
    const category = (item.category?.name || '').toLowerCase();
    return sku.includes(query) || name.includes(query) || category.includes(query);
  });

  populateItemsTable(filtered);
}

/**
 * Download QR code for item
 */
async function downloadQR(sku) {
  try {
    showToast(`Generating QR for ${sku}...`, 'info');

    // Fetch item data
    const item = dashboardItems.find(i => i.sku === sku);

    if (!item) {
      // Try to fetch from API
      if (typeof api !== 'undefined') {
        const response = await api.getItemBySku(sku);
        if (response.success && response.data) {
          generateAndDownloadQR(response.data);
          return;
        }
      }
      showToast('Item not found', 'error');
      return;
    }

    generateAndDownloadQR(item);
  } catch (error) {
    console.error('Download QR error:', error);
    showToast('Failed to download QR code', 'error');
  }
}

/**
 * Generate and download QR code
 */
function generateAndDownloadQR(item) {
  // Create canvas for QR generation
  const canvas = document.createElement('canvas');

  // Use node-qrcode API (QRCode.toCanvas with callback)
  QRCode.toCanvas(canvas, item.sku, {
    width: 256,
    margin: 2,
    color: {
      dark: "#1A2332",
      light: "#FFFFFF"
    },
    errorCorrectionLevel: 'H'
  }, (err) => {
    if (err) {
      console.error('QR generation error:', err);
      showToast('Failed to generate QR code', 'error');
      return;
    }

    // Download the generated QR code
    const link = document.createElement('a');
    link.download = `${item.sku}-qr-code.png`;
    link.href = canvas.toDataURL();
    link.click();
    showToast(`QR code downloaded for ${item.sku}`, 'success');
  });
}

/**
 * Delete item
 */
async function deleteItem(sku) {
  if (!confirm(`Are you sure you want to delete item ${sku}?\n\nThis action can be restored later.`)) {
    return;
  }

  try {
    if (typeof api === 'undefined') {
      showToast('Cannot delete: API not available', 'error');
      return;
    }

    const response = await api.deleteItem(sku);

    if (response.success) {
      showToast(`Item ${sku} deleted successfully`, 'success');
      // Update deletedAt in local array and refresh table (show as deleted, don't remove)
      const item = dashboardItems.find(i => i.sku === sku);
      if (item) {
        item.deletedAt = new Date().toISOString();
      }
      populateItemsTable(dashboardItems);
      // Refresh stats
      await loadStats();
    } else {
      showToast(response.message || 'Failed to delete item', 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Failed to delete item', 'error');
  }
}

/**
 * Restore soft-deleted item (admin only)
 */
async function restoreItem(sku) {
  if (!confirm(`Restore item ${sku}?`)) {
    return;
  }

  try {
    if (typeof api === 'undefined') {
      showToast('Cannot restore: API not available', 'error');
      return;
    }

    const response = await api.restoreItem(sku);

    if (response.success) {
      showToast(`Item ${sku} restored successfully`, 'success');
      // Update deletedAt in local array and refresh table
      const item = dashboardItems.find(i => i.sku === sku);
      if (item) {
        item.deletedAt = null;
      }
      populateItemsTable(dashboardItems);
      // Refresh stats
      await loadStats();
    } else {
      showToast(response.message || 'Failed to restore item', 'error');
    }
  } catch (error) {
    console.error('Restore error:', error);
    showToast('Failed to restore item', 'error');
  }
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M10 6v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L2 17h16L10 2z" stroke="currentColor" stroke-width="2"/><path d="M10 8v4m0 2h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M10 10v4m0-6h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;

  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 5000);
}

// Note: debounce is imported from utils.js (shared utility)
