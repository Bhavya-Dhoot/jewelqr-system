'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { computePrice } = require('./pricing');

const rates = {
    gold_rate_24k: 6500, labour_rate_per_g: 500, tax_percent: 3,
    stones: { rd: { label: 'RD', natural_rate: 50000, lab_rate: 25000 } },
};

test('fixed MRP returns the MRP as total', () => {
    const p = computePrice({ pricing_mode: 'Fixed MRP', mrp: 4200 }, rates);
    assert.strictEqual(p.total, 4200);
});

test('metal rate matches JewelQR v1 legacy formula', () => {
    // 5 g 18K + 0.5 ct natural RD:
    // gold 5*6500*0.75 = 24375, stone 0.5*50000 = 25000, labour 5*500 = 2500
    // subtotal 51875, tax 3% = 1556 (rounded), total 53431
    const p = computePrice({
        pricing_mode: 'Metal Rate', metal_purity: '18K', metal_weight_g: 5,
        stones: [{ stone_type: 'rd', source: 'Natural', weight_ct: 0.5 }],
    }, rates);
    assert.strictEqual(p.subtotal, 51875);
    assert.strictEqual(p.tax, 1556);
    assert.strictEqual(p.total, 53431);
});

test('lab-grown uses lab rate and unknown stones are reported, not priced', () => {
    const p = computePrice({
        pricing_mode: 'Metal Rate', metal_purity: '22K', metal_weight_g: 0,
        stones: [{ stone_type: 'rd', source: 'Lab-grown', weight_ct: 1 }, { stone_type: 'xx', weight_ct: 1 }],
    }, rates);
    assert.strictEqual(p.lines[1].value, 25000);
    assert.deepStrictEqual(p.missing_stone_rates, ['xx']);
});
