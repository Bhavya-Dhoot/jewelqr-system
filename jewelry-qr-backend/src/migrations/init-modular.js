/**
 * Migration: Initialize Modular Architecture
 * Creates default RateTable, PricingRule, AttributeSchemas, and ItemMasters
 * from existing Settings singleton
 * 
 * Run: node src/migrations/init-modular.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/env');
const {
    Settings,
    RateTable,
    AttributeSchema,
    PricingRule,
    ItemMaster
} = require('../models');

async function migrate() {
    console.log('🚀 Starting modular architecture migration...\n');

    try {
        // Connect to MongoDB
        await mongoose.connect(config.mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Step 1: Get existing settings
        console.log('📋 Step 1: Loading existing settings...');
        const settings = await Settings.getSettings();
        console.log('   Found settings:', settings._id);

        // Step 2: Create default RateTable from settings
        console.log('\n📋 Step 2: Creating default RateTable...');
        let rateTable = await RateTable.findOne({ name: 'Default Rates' });

        if (!rateTable) {
            rateTable = await RateTable.create({
                name: 'Default Rates',
                version: 1,
                rates: {
                    goldRate: settings.rates.goldRate,
                    labourRate: settings.rates.labourRate,
                    taxPercent: settings.rates.taxPercent
                },
                diamondPricing: settings.diamondPricing,
                polkiPricing: settings.polkiPricing,
                isActive: true
            });
            console.log('   ✅ Created RateTable:', rateTable.name, 'v' + rateTable.version);
        } else {
            console.log('   ⏭️  RateTable already exists:', rateTable.name);
        }

        // Step 3: Create default AttributeSchemas
        console.log('\n📋 Step 3: Creating default AttributeSchemas...');

        // Diamond article schema
        let diamondSchema = await AttributeSchema.findOne({ name: 'Diamond Article Schema' });
        if (!diamondSchema) {
            diamondSchema = await AttributeSchema.create({
                name: 'Diamond Article Schema',
                version: 1,
                description: 'Standard schema for diamond jewelry articles',
                articleType: 'diamond',
                fields: [
                    {
                        key: 'goldPurity',
                        label: 'Gold Purity',
                        type: 'enum',
                        required: true,
                        enumOptions: ['14K', '18K', '22K', '24K'],
                        pricingRole: 'goldPurity',
                        defaultValue: '18K'
                    },
                    {
                        key: 'goldWeight',
                        label: 'Gold Weight (g)',
                        type: 'number',
                        required: true,
                        min: 0.01,
                        max: 10000,
                        pricingRole: 'goldWeight'
                    },
                    {
                        key: 'diamondType',
                        label: 'Diamond Type',
                        type: 'enum',
                        required: false,
                        enumOptions: ['solitaire', 'rd', 'mq', 'moti', 'pear', 'round'],
                        pricingRole: 'diamondType'
                    },
                    {
                        key: 'diamondSource',
                        label: 'Diamond Source',
                        type: 'enum',
                        required: false,
                        enumOptions: ['real', 'cvd'],
                        pricingRole: 'diamondSource',
                        defaultValue: 'real'
                    },
                    {
                        key: 'diamondWeight',
                        label: 'Diamond Weight (ct)',
                        type: 'number',
                        required: false,
                        min: 0.01,
                        max: 100,
                        pricingRole: 'diamondWeight'
                    }
                ],
                isActive: true
            });
            console.log('   ✅ Created Diamond Schema:', diamondSchema.name);
        } else {
            console.log('   ⏭️  Diamond Schema already exists');
        }

        // Polki article schema
        let polkiSchema = await AttributeSchema.findOne({ name: 'Polki Article Schema' });
        if (!polkiSchema) {
            polkiSchema = await AttributeSchema.create({
                name: 'Polki Article Schema',
                version: 1,
                description: 'Standard schema for polki jewelry articles',
                articleType: 'polki',
                fields: [
                    {
                        key: 'goldPurity',
                        label: 'Gold Purity',
                        type: 'enum',
                        required: true,
                        enumOptions: ['14K', '18K', '22K', '24K'],
                        pricingRole: 'goldPurity',
                        defaultValue: '22K'
                    },
                    {
                        key: 'goldWeight',
                        label: 'Gold Weight (g)',
                        type: 'number',
                        required: true,
                        min: 0.01,
                        max: 10000,
                        pricingRole: 'goldWeight'
                    },
                    {
                        key: 'polkiType',
                        label: 'Polki/Stone Type',
                        type: 'enum',
                        required: false,
                        enumOptions: ['polki', 'stone'],
                        pricingRole: 'polkiType'
                    },
                    {
                        key: 'polkiWeight',
                        label: 'Polki Weight (ct)',
                        type: 'number',
                        required: false,
                        min: 0.01,
                        max: 100,
                        pricingRole: 'polkiWeight'
                    }
                ],
                isActive: true
            });
            console.log('   ✅ Created Polki Schema:', polkiSchema.name);
        } else {
            console.log('   ⏭️  Polki Schema already exists');
        }

        // Step 4: Create default PricingRule
        console.log('\n📋 Step 4: Creating default PricingRule...');
        let pricingRule = await PricingRule.findOne({ name: 'JewelQR v1 Compatible' });

        if (!pricingRule) {
            pricingRule = await PricingRule.create({
                name: 'JewelQR v1 Compatible',
                version: 1,
                description: 'Compatible with v1.3.x calculation logic',
                articleType: 'both',
                logicType: 'jewelqr_v1_compat',
                config: {
                    purityFactors: new Map([
                        ['14K', 0.583],
                        ['18K', 0.75],
                        ['22K', 0.9167],
                        ['24K', 0.999]
                    ]),
                    diamondTypeMapping: new Map([
                        ['marquise', 'mq'],
                        ['markish', 'mq'],
                        ['solitare', 'solitaire'],
                        ['sol', 'solitaire']
                    ]),
                    labourFormula: 'rate_x_weight'
                },
                rateTableRef: rateTable._id,
                isActive: true
            });
            console.log('   ✅ Created PricingRule:', pricingRule.name);
        } else {
            console.log('   ⏭️  PricingRule already exists');
        }

        // Step 5: Create default ItemMasters
        console.log('\n📋 Step 5: Creating default ItemMasters...');

        const categories = settings.jewelryCategories || [
            { id: 'chain', name: 'Chain', prefix: 'CHN' },
            { id: 'necklace', name: 'Necklace', prefix: 'NCK' }
        ];

        // Create one master per category per article type
        for (const category of categories.slice(0, 2)) { // Just first 2 for demo
            // Diamond master
            const diamondMasterName = `${category.name} - Diamond Standard`;
            let diamondMaster = await ItemMaster.findOne({ name: diamondMasterName });

            if (!diamondMaster) {
                diamondMaster = await ItemMaster.create({
                    name: diamondMasterName,
                    description: `Standard diamond ${category.name.toLowerCase()} template`,
                    category: {
                        id: category.id,
                        name: category.name,
                        prefix: category.prefix
                    },
                    articleType: 'diamond',
                    schemaRef: diamondSchema._id,
                    pricingRuleRef: pricingRule._id,
                    defaults: {
                        gold: { purity: '18K', weight_g: null },
                        diamonds: [],
                        polkiStones: []
                    },
                    sortOrder: 1,
                    isActive: true
                });
                console.log('   ✅ Created ItemMaster:', diamondMaster.name);
            }

            // Polki master
            const polkiMasterName = `${category.name} - Polki Standard`;
            let polkiMaster = await ItemMaster.findOne({ name: polkiMasterName });

            if (!polkiMaster) {
                polkiMaster = await ItemMaster.create({
                    name: polkiMasterName,
                    description: `Standard polki ${category.name.toLowerCase()} template`,
                    category: {
                        id: category.id,
                        name: category.name,
                        prefix: category.prefix
                    },
                    articleType: 'polki',
                    schemaRef: polkiSchema._id,
                    pricingRuleRef: pricingRule._id,
                    defaults: {
                        gold: { purity: '22K', weight_g: null },
                        diamonds: [],
                        polkiStones: []
                    },
                    sortOrder: 2,
                    isActive: true
                });
                console.log('   ✅ Created ItemMaster:', polkiMaster.name);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('✅ Migration completed successfully!\n');

        const counts = {
            rateTables: await RateTable.countDocuments(),
            schemas: await AttributeSchema.countDocuments(),
            pricingRules: await PricingRule.countDocuments(),
            itemMasters: await ItemMaster.countDocuments()
        };

        console.log('📊 Collection counts:');
        console.log(`   RateTables:      ${counts.rateTables}`);
        console.log(`   AttributeSchemas: ${counts.schemas}`);
        console.log(`   PricingRules:    ${counts.pricingRules}`);
        console.log(`   ItemMasters:     ${counts.itemMasters}`);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

// Run migration
migrate();
