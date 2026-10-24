'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { mapVariant } = require('./shopify');

const ctx = {
    categories: ['Earrings', 'Ear Cuffs', 'Necklaces', 'Pendants', 'Rings', 'Bracelets', 'Brooches', 'Jewellery Sets', 'Accessories'],
    collections: ['Prism 3.0', 'Origin', 'The Daily Edit', "Darlin'"],
};
const variant = (title, productType, tags, options) => ({ title: options.map(o => o.value).join(' / '), selectedOptions: options, product: { title, productType, tags } });

test('crystal colour variant of a Prism 3.0 pendant (shapes from esmecrystal.com)', () => {
    const m = mapVariant(variant('Tova Pendant', '', ['prism 3.0', 'new', 'Pendant'], [{ name: 'Color', value: 'Diamond white' }]), ctx);
    assert.deepStrictEqual(m, { name: 'Tova Pendant - Diamond White', category: 'Pendants', collection: 'Prism 3.0', finish: '', colour: 'Diamond White' });
});

test('plating variant becomes the finish; an ear cuff is not filed under earrings', () => {
    const m = mapVariant(variant('Molten Arc Ear Cuff', '', ['the daily edit', 'Earcuff'], [{ name: 'Color', value: 'Golden' }]), ctx);
    assert.strictEqual(m.finish, 'Gold Plated'); assert.strictEqual(m.category, 'Ear Cuffs'); assert.strictEqual(m.collection, 'The Daily Edit');
    assert.strictEqual(m.name, 'Molten Arc Ear Cuff - Gold');
});

test('extra options join the name, "Product style" is ignored, apostrophes match collections', () => {
    const m = mapVariant(variant('DARLING DREAM EARRINGS', 'Earrings', ["darlin' collection"], [{ name: 'Color', value: 'Product Style' }]), ctx);
    assert.strictEqual(m.name, 'DARLING DREAM EARRINGS'); assert.strictEqual(m.collection, "Darlin'");
    const h = mapVariant(variant('Facet Hoop Earrings', '', ['origin collection'], [{ name: 'Style', value: 'Oval W' }, { name: 'Color', value: 'Gold' }]), ctx);
    assert.strictEqual(h.name, 'Facet Hoop Earrings - Oval W / Gold'); assert.strictEqual(h.category, 'Earrings');
});

