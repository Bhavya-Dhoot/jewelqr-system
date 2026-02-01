/**
 * SCAN Page JavaScript
 * Handles QR scanning, composition display, and price computation
 */

// State management
let html5QrCode = null;
let currentItemData = null;
let cameraId = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeScan();
    setupEventListeners();
});

/**
 * Initialize scan page
 */
async function initializeScan() {
    // Hide all sections initially except camera
    document.getElementById('compositionCard').classList.add('hidden');
    document.getElementById('pricePanel').classList.add('hidden');
    document.getElementById('breakdownCard').classList.add('hidden');

    // FORCE refresh config from API to ensure latest rates (bypass cache)
    if (typeof config !== 'undefined') {
        try {
            await config.refreshConfig(); // Force fresh fetch, not cached
        } catch (e) {
            console.warn('Failed to fetch config, using cached:', e.message);
        }

        // Pre-fill rates from config (use ?? to preserve 0 values)
        const rates = config.getDefaultRates();
        document.getElementById('goldRate').value = rates.goldRate ?? 6500;
        document.getElementById('labourRate').value = rates.labourRate ?? 500;
        document.getElementById('taxPercent').value = rates.taxPercent ?? 3;
    }

    // Start camera
    startCamera();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Camera controls
    document.getElementById('torchBtn')?.addEventListener('click', toggleTorch);
    document.getElementById('switchCameraBtn')?.addEventListener('click', switchCamera);

    // Actions
    document.getElementById('scanNewBtn')?.addEventListener('click', resetToScan);
    document.getElementById('copySkuBtn')?.addEventListener('click', copySku);
    document.getElementById('calculateBtn')?.addEventListener('click', calculatePrice);
    document.getElementById('shareBtn')?.addEventListener('click', sharePrice);
    document.getElementById('newCalculationBtn')?.addEventListener('click', resetToRates);
    document.getElementById('scanAnotherBtn')?.addEventListener('click', resetToScan);

    // Inline SKU entry
    document.getElementById('searchSkuBtn')?.addEventListener('click', searchBySku);
    document.getElementById('skuInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchBySku();
        }
    });

    // Error modal
    document.getElementById('tryAgainBtn')?.addEventListener('click', closeErrorModal);

    // Advanced panel toggle
    document.getElementById('advancedToggle')?.addEventListener('click', toggleAdvancedPanel);

    // Recalculate button (for manual rate overrides)
    document.getElementById('recalculateBtn')?.addEventListener('click', calculatePrice);
}

/**
 * Toggle advanced settings panel
 */
function toggleAdvancedPanel() {
    const content = document.getElementById('advancedContent');
    const toggle = document.getElementById('advancedToggle');
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
        content.classList.remove('expanded');
        toggle.setAttribute('aria-expanded', 'false');
    } else {
        content.classList.add('expanded');
        toggle.setAttribute('aria-expanded', 'true');
    }
}

/**
 * Start camera and QR scanning
 */
async function startCamera() {
    try {
        html5QrCode = new Html5Qrcode("qrReader");

        // Get cameras
        const devices = await Html5Qrcode.getCameras();

        if (devices && devices.length > 0) {
            // Prefer back camera (environment)
            cameraId = devices.find(device =>
                device.label.toLowerCase().includes('back') ||
                device.label.toLowerCase().includes('environment')
            )?.id || devices[0].id;

            // Start scanning
            await html5QrCode.start(
                cameraId,
                {
                    fps: 10,
                    qrbox: { width: 280, height: 280 },
                    aspectRatio: 1.0
                },
                onScanSuccess,
                onScanFailure
            );

            showToast('Camera ready - point at QR code', 'info');

        } else {
            throw new Error('No cameras found');
        }
    } catch (err) {
        console.error('Camera error:', err);
        showPermissionDenied();
    }
}

/**
 * Handle successful QR scan
 * Supports both SKU-only (new) and JSON (legacy) QR formats
 */
async function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning
    html5QrCode.stop();

    // Hide camera section
    document.getElementById('cameraSection').style.height = '120px';

    try {
        let sku;

        // Detect format: SKU-only (new) vs JSON (legacy)
        if (decodedText.trim().startsWith('{')) {
            // Legacy JSON format - extract SKU from embedded data
            const legacyData = JSON.parse(decodedText);
            sku = legacyData.sku;
            console.log('Legacy QR format detected, extracting SKU:', sku);
        } else {
            // New SKU-only format
            sku = decodedText.trim().toUpperCase();
            console.log('SKU-only QR format detected:', sku);
        }

        // Validate SKU format
        const skuPattern = /^[A-Z]{3}-[A-Z0-9]{6}$/;
        if (!sku || !skuPattern.test(sku)) {
            throw new Error('Invalid SKU format');
        }

        // Fetch item from database
        await fetchAndDisplayItem(sku);

        showToast('Item loaded successfully!', 'success');

    } catch (error) {
        console.error('QR scan error:', error);
        showErrorModal();
        // Restart camera after delay
        setTimeout(() => {
            document.getElementById('cameraSection').style.height = '400px';
            startCamera();
        }, 2000);
    }
}

/**
 * Fetch item from API and display it
 */
async function fetchAndDisplayItem(sku) {
    // Check if API is available
    if (typeof api === 'undefined' || !api.getItemBySku) {
        throw new Error('API not available. Please check your connection.');
    }

    // Fetch item from API
    const response = await api.getItemBySku(sku);

    if (response.success && response.data) {
        const item = response.data;

        // Transform API data to display format
        currentItemData = transformApiData(item);

        // Display item composition
        displayComposition(currentItemData);

        // Show relevant sections
        document.getElementById('compositionCard').classList.remove('hidden');
        document.getElementById('pricePanel').classList.remove('hidden');

        // Auto-fill rates from config and calculate immediately
        await autoFillRatesAndCalculate();
    } else {
        throw new Error(response.message || 'Item not found');
    }
}

/**
 * Auto-fill rate inputs from config and trigger calculation
 * Note: config.initConfig() already called once in initializeScan - use cached config here
 */
async function autoFillRatesAndCalculate() {
    // Use cached config (already initialized in initializeScan)
    let rates = { goldRate: 6500, labourRate: 500, taxPercent: 3 };

    if (typeof config !== 'undefined') {
        rates = config.getDefaultRates();
    }

    // ALWAYS fill rate inputs from config (force-set for auto-calc)
    const goldRateInput = document.getElementById('goldRate');
    const labourRateInput = document.getElementById('labourRate');
    const taxPercentInput = document.getElementById('taxPercent');

    if (goldRateInput) goldRateInput.value = rates.goldRate || 6500;
    if (labourRateInput) labourRateInput.value = rates.labourRate || 500;
    if (taxPercentInput) taxPercentInput.value = rates.taxPercent || 3;

    // Calculate price immediately using these rates (silent - no toast)
    calculatePriceWithRates(rates.goldRate || 6500, rates.labourRate || 500, rates.taxPercent || 3, false);
}

/**
 * Auto-calculate price (called after item load, no toast)
 */
function calculatePriceAuto() {
    const goldRateInput = document.getElementById('goldRate');
    const labourRateInput = document.getElementById('labourRate');
    const taxPercentInput = document.getElementById('taxPercent');

    // Fallback to config if inputs are empty
    const rates = typeof config !== 'undefined' ? config.getDefaultRates() : { goldRate: 6500, labourRate: 500, taxPercent: 3 };

    const goldRate = parseFloat(goldRateInput?.value) || rates.goldRate;
    const labourRate = parseFloat(labourRateInput?.value) || rates.labourRate;
    const taxPercent = parseFloat(taxPercentInput?.value) || rates.taxPercent;

    // Ensure inputs have values for manual recalculation
    if (goldRateInput && !goldRateInput.value) goldRateInput.value = goldRate;
    if (labourRateInput && !labourRateInput.value) labourRateInput.value = labourRate;
    if (taxPercentInput && !taxPercentInput.value) taxPercentInput.value = taxPercent;

    // Run calculation (reuse existing logic)
    calculatePriceWithRates(goldRate, labourRate, taxPercent, false);
}

/**
 * Handle scan failure (called repeatedly, so we don't show errors)
 */
function onScanFailure(error) {
    // Silent - this is called for every frame without a QR code
}

/**
 * Display scanned composition data
 */
function displayComposition(data) {
    // SKU
    document.getElementById('scannedSku').textContent = data.sku;

    // Name (optional)
    const nameEl = document.getElementById('scannedName');
    if (data.name) {
        nameEl.textContent = data.name;
        nameEl.classList.remove('hidden');
    } else {
        nameEl.classList.add('hidden');
    }

    // Gold
    document.getElementById('goldPurity').textContent = data.purity;
    document.getElementById('goldWeight').textContent = `${data.gold_weight_g}g`;

    // Diamonds or Legacy Polki handling
    const diamondSection = document.getElementById('diamondSection');
    const diamondList = document.getElementById('diamondList');
    const diamondCount = document.getElementById('diamondCount');
    const sectionLabel = diamondSection.querySelector('.info-label');

    if (data.articleType === 'polki' && data.polkiStones && data.polkiStones.length > 0) {
        // LEGACY POLKI: Show "Legacy" badge instead of stone details
        // Pricing still works correctly (calculated in calculatePriceWithRates)
        if (sectionLabel) sectionLabel.innerHTML = `<span style="color: var(--color-warning);">⚠️ Legacy (Polki)</span>`;
        diamondCount.textContent = data.polkiStones.length;
        diamondSection.classList.remove('hidden');
        diamondList.innerHTML = '<li style="color: var(--color-gray-500); font-style: italic;">Polki display disabled. Pricing calculated from stored data.</li>';
    } else if (data.diamonds && data.diamonds.length > 0) {
        // Show Diamond entries
        if (sectionLabel) sectionLabel.innerHTML = `Diamonds (<span id="diamondCount">${data.diamonds.length}</span>)`;
        diamondCount.textContent = data.diamonds.length;
        diamondSection.classList.remove('hidden');

        diamondList.innerHTML = data.diamonds.map(d => {
            const sourceLabel = d.source === 'cvd' ? '<span style="color: var(--color-info); font-size: 0.75rem;">(CVD)</span>' : '<span style="color: var(--color-success); font-size: 0.75rem;">(Natural)</span>';
            return `<li>${d.type} ${sourceLabel} - ${d.weight_ct} ct</li>`;
        }).join('');
    } else {
        diamondSection.classList.add('hidden');
    }
}

/**
 * Calculate current price (manual trigger from button)
 */
function calculatePrice() {
    const goldRate = parseFloat(document.getElementById('goldRate').value);
    const labourRate = parseFloat(document.getElementById('labourRate')?.value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;

    // Validation
    if (!goldRate || goldRate <= 0) {
        showToast('Please enter gold rate', 'error');
        document.getElementById('goldRate').focus();
        return;
    }

    calculatePriceWithRates(goldRate, labourRate, taxPercent, true);
}

/**
 * Calculate price with given rates
 * @param {number} goldRate 
 * @param {number} labourRate 
 * @param {number} taxPercent 
 * @param {boolean} showSuccessToast - Whether to show success toast
 */
function calculatePriceWithRates(goldRate, labourRate, taxPercent, showSuccessToast = true) {
    if (!currentItemData) {
        if (showSuccessToast) showToast('No item loaded', 'error');
        return;
    }

    // Get gold weight and purity
    const goldWeight = currentItemData.gold_weight_g || 0;
    const goldPurity = currentItemData.purity || '22K';

    // Get purity factor from config (24K=1.0, 22K=0.92, 18K=0.76, 14K=0.60)
    const purityFactor = config.getPurityFactor(goldPurity);

    // Calculate gold value = Weight × Rate × Purity Factor
    const goldValue = goldWeight * goldRate * purityFactor;

    // Calculate labour cost = Labour Rate × Gold Weight
    const labourCost = labourRate * goldWeight;

    // Get pricing from config
    const diamondPricing = config.getDiamondPricing();
    const polkiPricing = config.getPolkiPricing();

    // Determine article type
    const articleType = currentItemData.articleType || 'diamond';

    // Calculate diamond/polki value based on article type
    let stoneValue = 0;
    let stoneLabel = 'Diamond';
    let stoneCalcParts = []; // Track each stone's calculation

    if (articleType === 'polki') {
        stoneLabel = 'Polki/Stone';
        // Calculate polki/stone value
        const polkiStones = currentItemData.polkiStones || [];
        polkiStones.forEach(p => {
            const typeId = (p.type_id || 'stone').toLowerCase();
            const categoryPricing = polkiPricing[typeId] || polkiPricing.stone;
            const rate = categoryPricing.realRate;
            const value = p.weight_ct * rate;
            stoneValue += value;
            // Format: "3ct×₹25k" (show rate in thousands)
            const rateK = rate >= 1000 ? `₹${(rate / 1000).toFixed(0)}k` : `₹${rate}`;
            stoneCalcParts.push(`${p.weight_ct}ct×${rateK}`);
        });
    } else {
        // Calculate diamond value using per-category rates
        if (currentItemData.diamonds && currentItemData.diamonds.length > 0) {
            currentItemData.diamonds.forEach(d => {
                let typeId = (d.type_id || d.type || 'round').toLowerCase();

                // Normalize type IDs using dynamic aliases from config
                const aliases = config.getDiamondTypeAliases();
                if (aliases[typeId]) {
                    console.log(`Diamond type '${typeId}' mapped to '${aliases[typeId]}'`);
                    typeId = aliases[typeId];
                }

                const categoryPricing = diamondPricing[typeId] || diamondPricing.round;
                if (!diamondPricing[typeId]) {
                    console.warn(`No pricing found for diamond type '${typeId}', using 'round' fallback`);
                }

                const rate = (d.source === 'cvd') ? categoryPricing.cvdRate : categoryPricing.realRate;
                const value = d.weight_ct * rate;
                stoneValue += value;
                // Format: "1ct×₹100k" (show rate in thousands)
                const rateK = rate >= 1000 ? `₹${(rate / 1000).toFixed(0)}k` : `₹${rate}`;
                stoneCalcParts.push(`${d.weight_ct}ct×${rateK}`);
            });
        }
    }

    // Build stone calculation string (e.g., "1ct×₹100k + 0.5ct×₹19k")
    const stoneCalcDetail = stoneCalcParts.join(' + ') || 'No stones';

    // Calculate totals (Gold + Stone + Labour)
    const subtotal = goldValue + stoneValue + labourCost;
    const taxAmount = subtotal * (taxPercent / 100);
    const total = subtotal + taxAmount;

    // Display breakdown with purity info
    displayBreakdown({
        goldValue,
        goldWeight,
        goldRate,
        goldPurity,
        purityFactor,
        stoneValue,
        stoneLabel,
        stoneCalcDetail,
        labourCost,
        labourRate,
        subtotal,
        taxPercent,
        taxAmount,
        total
    });

    // Display item images in breakdown
    if (currentItemData) {
        displayBreakdownImages(currentItemData);
    }

    // Show breakdown card
    document.getElementById('breakdownCard').classList.remove('hidden');

    // Scroll to breakdown
    document.getElementById('breakdownCard').scrollIntoView({ behavior: 'smooth' });

    if (showSuccessToast) {
        showToast('Price calculated!', 'success');
    }
}

/**
 * Display price breakdown
 */
function displayBreakdown(values) {
    // Gold value with purity calculation detail
    document.getElementById('goldValue').textContent = formatCurrency(values.goldValue);

    // Update gold label to show purity factor
    const goldLabelEl = document.getElementById('goldLabelText');
    if (goldLabelEl) {
        const purityPercent = Math.round(values.purityFactor * 100);
        goldLabelEl.innerHTML = `Gold Value <span class="text-gray text-sm">(${values.goldPurity} @ ${purityPercent}%)</span>`;
    }

    // Update gold calculation detail
    const goldCalcEl = document.getElementById('goldCalcDetail');
    if (goldCalcEl) {
        goldCalcEl.textContent = `${values.goldWeight}g × ₹${values.goldRate.toLocaleString('en-IN')} × ${values.purityFactor}`;
    }

    // Update stone value label and amount (Diamond or Polki/Stone)
    const stoneLabelEl = document.getElementById('stoneLabelText');
    if (stoneLabelEl) stoneLabelEl.textContent = values.stoneLabel || 'Diamond';
    document.getElementById('diamondValue').textContent = formatCurrency(values.stoneValue);

    // Update stone calculation detail (e.g., "1ct×₹100k + 0.5ct×₹19k")
    const stoneCalcEl = document.getElementById('stoneCalcDetail');
    if (stoneCalcEl) {
        stoneCalcEl.textContent = values.stoneCalcDetail || '';
    }

    // Labour cost (Rate × Gold Weight) with calculation detail
    const labourValueEl = document.getElementById('labourValue');
    if (labourValueEl) labourValueEl.textContent = formatCurrency(values.labourCost || 0);

    // Update labour calculation detail
    const labourCalcEl = document.getElementById('labourCalcDetail');
    if (labourCalcEl) {
        labourCalcEl.textContent = `${values.goldWeight}g × ₹${values.labourRate?.toLocaleString('en-IN') || 0}`;
    }

    document.getElementById('subtotalValue').textContent = formatCurrency(values.subtotal);
    document.getElementById('taxPercentDisplay').textContent = values.taxPercent;
    document.getElementById('taxValue').textContent = formatCurrency(values.taxAmount);
    document.getElementById('totalValue').textContent = formatCurrency(values.total);
}

/**
 * Format currency
 */
function formatCurrency(value) {
    return '₹ ' + value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Copy SKU to clipboard
 */
async function copySku() {
    const sku = document.getElementById('scannedSku').textContent;

    try {
        await navigator.clipboard.writeText(sku);
        showToast('SKU copied to clipboard', 'success');
    } catch (err) {
        showToast('Failed to copy SKU', 'error');
    }
}

/**
 * Share price
 */
async function sharePrice() {
    const sku = currentItemData.sku;
    const total = document.getElementById('totalValue').textContent;

    const shareText = `Jewelry Item: ${sku}\nTotal Price: ${total}`;

    try {
        if (navigator.share) {
            await navigator.share({
                title: 'Jewelry Price',
                text: shareText
            });
        } else {
            // Fallback - copy to clipboard
            await navigator.clipboard.writeText(shareText);
            showToast('Price details copied to clipboard', 'success');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showToast('Failed to share price', 'error');
        }
    }
}

/**
 * Reset to scan new item
 */
async function resetToScan() {
    // Hide composition and price panels
    document.getElementById('compositionCard').classList.add('hidden');
    document.getElementById('pricePanel').classList.add('hidden');
    document.getElementById('breakdownCard').classList.add('hidden');

    // Show SKU entry section
    document.getElementById('skuEntrySection').classList.remove('hidden');
    document.getElementById('skuInput').value = '';
    document.getElementById('skuSearchError').classList.add('hidden');

    // Clear rate inputs - use correct field IDs
    document.getElementById('goldRate').value = '';
    if (document.getElementById('labourRate')) document.getElementById('labourRate').value = '';
    document.getElementById('taxPercent').value = '3';

    // Reset camera section
    document.getElementById('cameraSection').style.height = '400px';

    // Clear current data
    currentItemData = null;

    // Restart camera
    await startCamera();
}

/**
 * Reset to enter new rates (keep composition)
 */
function resetToRates() {
    // Hide breakdown
    document.getElementById('breakdownCard').classList.add('hidden');

    // Clear rate inputs - use correct field IDs
    document.getElementById('goldRate').value = '';
    if (document.getElementById('labourRate')) document.getElementById('labourRate').value = '';

    // Scroll to price panel
    document.getElementById('pricePanel').scrollIntoView({ behavior: 'smooth' });

    showToast('Enter new rates to recalculate', 'info');
}

/**
 * Toggle flashlight/torch
 */
async function toggleTorch() {
    try {
        const track = html5QrCode.getRunningTrackCameraCapabilities();
        if (track.torch) {
            // Toggle torch
            await track.applyConstraints({
                advanced: [{ torch: !track.getSettings().torch }]
            });
            showToast('Flashlight toggled', 'info');
        } else {
            showToast('Flashlight not available', 'warning');
        }
    } catch (err) {
        showToast('Failed to toggle flashlight', 'error');
    }
}

/**
 * Switch camera (front/back)
 */
async function switchCamera() {
    try {
        await html5QrCode.stop();

        const devices = await Html5Qrcode.getCameras();
        if (devices.length > 1) {
            // Find other camera
            const currentIndex = devices.findIndex(d => d.id === cameraId);
            cameraId = devices[(currentIndex + 1) % devices.length].id;

            await startCamera();
            showToast('Camera switched', 'success');
        } else {
            showToast('No other camera available', 'warning');
            await startCamera(); // Restart current camera
        }
    } catch (err) {
        showToast('Failed to switch camera', 'error');
    }
}

/**
 * Show permission denied state
 */
function showPermissionDenied() {
    document.getElementById('cameraSection').classList.add('hidden');
    document.getElementById('permissionDenied').classList.remove('hidden');
}

/**
 * Show error modal
 */
function showErrorModal() {
    document.getElementById('errorModal').classList.remove('hidden');
}

/**
 * Close error modal
 */
function closeErrorModal() {
    document.getElementById('errorModal').classList.add('hidden');
}


/**
 * Search item by SKU via API
 */
async function searchBySku() {
    const skuInput = document.getElementById('skuInput');
    const errorDiv = document.getElementById('skuSearchError');
    const searchBtn = document.getElementById('searchSkuBtn');

    const sku = skuInput.value.trim().toUpperCase();

    // Validate SKU format
    if (!sku) {
        errorDiv.textContent = 'Please enter a SKU';
        errorDiv.classList.remove('hidden');
        skuInput.focus();
        return;
    }

    // Basic format validation (XXX-XXXXXX)
    const skuPattern = /^[A-Z]{3}-[A-Z0-9]{6}$/;
    if (!skuPattern.test(sku)) {
        errorDiv.textContent = 'Invalid format. Use: XXX-XXXXXX (e.g., CHN-000001)';
        errorDiv.classList.remove('hidden');
        skuInput.focus();
        return;
    }

    // Show loading state
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="loading-spinner"></span> Searching...';
    errorDiv.classList.add('hidden');

    try {
        // Check if API is available
        if (typeof api === 'undefined' || !api.getItemBySku) {
            throw new Error('API not available');
        }

        // Fetch item from API
        const response = await api.getItemBySku(sku);

        if (response.success && response.data) {
            const item = response.data;

            // Transform API data to display format
            const itemData = transformApiData(item);
            currentItemData = itemData;

            // Clear input and hide SKU section
            document.getElementById('skuInput').value = '';
            document.getElementById('skuEntrySection').classList.add('hidden');

            // Hide camera, show results
            document.getElementById('cameraSection').style.height = '120px';
            document.getElementById('permissionDenied').classList.add('hidden');

            // Display item
            displayComposition(itemData);
            document.getElementById('compositionCard').classList.remove('hidden');
            document.getElementById('pricePanel').classList.remove('hidden');

            // Auto-fill rates and calculate immediately (same as QR scan)
            await autoFillRatesAndCalculate();

            showToast(`Found: ${item.name || sku}`, 'success');
        } else {
            throw new Error(response.message || 'Item not found');
        }

    } catch (error) {
        console.error('SKU search error:', error);
        errorDiv.textContent = error.message === 'Item not found' || error.message.includes('404')
            ? `SKU "${sku}" not found in database`
            : error.message;
        errorDiv.classList.remove('hidden');
        skuInput.select();
    } finally {
        // Reset button
        searchBtn.disabled = false;
        searchBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="2" />
                <path d="M11 11l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Search
        `;
    }
}

/**
 * Transform API response data to display format
 */
function transformApiData(item) {
    // The API returns data in a slightly different format
    // Transform it to match what displayComposition expects
    return {
        sku: item.sku,
        name: item.name || '',
        articleType: item.articleType || 'diamond',
        purity: item.gold?.purity || '18K',
        gold_weight_g: item.gold?.weight_g || 0,
        diamonds: (item.diamonds || []).map(d => ({
            type_id: d.type_id,
            type: d.type_name || d.type_id,
            source: d.source,
            weight_ct: d.weight_ct
        })),
        polkiStones: (item.polkiStones || []).map(p => ({
            type_id: p.type_id,
            type: p.type_name || p.type_id,
            weight_ct: p.weight_ct
        })),
        category: item.category?.name || 'Unknown',
        // Include images for display in breakdown
        images: item.images || { primary: null, gallery: [] }
    };
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');

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

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// ============ BREAKDOWN IMAGES ============

/**
 * Display item images in breakdown section
 */
function displayBreakdownImages(item) {
    const primaryContainer = document.getElementById('breakdownImagePrimary');
    const galleryContainer = document.getElementById('breakdownImageGallery');

    if (!primaryContainer) return;

    const apiBase = 'http://localhost:3000'; // Backend URL

    // Primary image
    if (item.images && item.images.primary) {
        primaryContainer.innerHTML = `<img src="${apiBase}${item.images.primary}" alt="Item image" onerror="this.parentElement.innerHTML='<span class=\\'no-image-placeholder\\'>No Image</span>'">`;
        primaryContainer.classList.add('has-image');

        // Click to enlarge
        primaryContainer.onclick = () => showImageLightbox(`${apiBase}${item.images.primary}`);
    } else {
        primaryContainer.innerHTML = '<span class="no-image-placeholder">No Image</span>';
        primaryContainer.classList.remove('has-image');
        primaryContainer.onclick = null;
    }

    // Gallery images
    if (galleryContainer) {
        if (item.images && item.images.gallery && item.images.gallery.length > 0) {
            galleryContainer.innerHTML = item.images.gallery.map((path, i) => `
                <div class="breakdown-gallery-thumb" onclick="showImageLightbox('${apiBase}${path}')">
                    <img src="${apiBase}${path}" alt="Gallery image ${i + 1}" onerror="this.parentElement.style.display='none'">
                </div>
            `).join('');
        } else {
            galleryContainer.innerHTML = '';
        }
    }
}

/**
 * Show image in fullscreen lightbox
 */
function showImageLightbox(imageSrc) {
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML = `
        <img src="${imageSrc}" alt="Full size image">
        <button class="image-lightbox-close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    `;

    lightbox.onclick = (e) => {
        if (e.target === lightbox || e.target.closest('.image-lightbox-close')) {
            lightbox.remove();
        }
    };

    document.body.appendChild(lightbox);
}

// Cleanup on page unload/navigation (prevents memory leaks)
function cleanupCamera() {
    if (html5QrCode) {
        try {
            if (html5QrCode.isScanning) {
                html5QrCode.stop();
            }
        } catch (e) {
            console.warn('Camera cleanup error:', e);
        }
    }
}
window.addEventListener('beforeunload', cleanupCamera);
window.addEventListener('pagehide', cleanupCamera);

