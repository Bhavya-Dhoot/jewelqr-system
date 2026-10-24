'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { nextSkuFrom } = require('./inventory');

test('next SKU follows the highest number for the prefix', () => {
    assert.strictEqual(nextSkuFrom('EAR', []), 'EAR-00001');
    assert.strictEqual(nextSkuFrom('EAR', ['EAR-00002', 'EAR-00010', 'ECF-00099']), 'EAR-00011');
});

test('hand-made or legacy codes without a number are ignored', () => {
    assert.strictEqual(nextSkuFrom('RNG', ['RNG-SAMPLE', 'RNG-00007']), 'RNG-00008');
});
