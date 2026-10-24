'use strict';

// Price computation. Two modes:
//   Fixed MRP  - the price is the item's MRP (Item Price on "Standard Selling"), tax inclusive.
//   Metal Rate - gold + stones + labour + tax, from today's rates. Same formula as JewelQR v1.x
//                so legacy items price identically after migration.

const PURITY_FACTORS = { '24K': 0.999, '22K': 0.9167, '18K': 0.75, '14K': 0.583 };
const inr = n => `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * @param {object} item  { pricing_mode, mrp, metal_purity, metal_weight_g, stones: [{stone_type, source, weight_ct}] }
 * @param {object} rates { gold_rate_24k, labour_rate_per_g, tax_percent, stones: { [code]: { label, natural_rate, lab_rate } } }
 */
function computePrice(item, rates) {
    if (item.pricing_mode !== 'Metal Rate') {
        const mrp = Number(item.mrp) || 0;
        return { mode: 'Fixed MRP', lines: [{ label: 'MRP (incl. taxes)', value: mrp }], subtotal: mrp, tax: 0, total: mrp };
    }

    const weight = Number(item.metal_weight_g) || 0;
    const factor = PURITY_FACTORS[item.metal_purity] ?? PURITY_FACTORS['18K'];
    const lines = [];

    lines.push({
        label: `Gold ${item.metal_purity || '18K'} · ${weight} g`,
        detail: `${weight} g × ${inr(rates.gold_rate_24k)}/g (24K) × ${factor}`,
        value: Math.round(weight * rates.gold_rate_24k * factor),
    });

    const missing = [];
    for (const s of item.stones || []) {
        const type = rates.stones[s.stone_type];
        if (!type) { missing.push(s.stone_type); continue; }
        const rate = s.source === 'Lab-grown' ? type.lab_rate : type.natural_rate;
        lines.push({
            label: `${type.label} (${s.source || 'Natural'}) · ${s.weight_ct} ct`,
            detail: `${s.weight_ct} ct × ${inr(rate)}/ct`,
            value: Math.round(s.weight_ct * rate),
        });
    }

    lines.push({
        label: 'Making charges',
        detail: `${weight} g × ${inr(rates.labour_rate_per_g)}/g`,
        value: Math.round(weight * rates.labour_rate_per_g),
    });

    const subtotal = lines.reduce((sum, l) => sum + l.value, 0);
    const tax = Math.round(subtotal * rates.tax_percent / 100);
    return { mode: 'Metal Rate', lines, subtotal, tax, tax_percent: rates.tax_percent, total: subtotal + tax, missing_stone_rates: missing };
}

module.exports = { computePrice, PURITY_FACTORS };
