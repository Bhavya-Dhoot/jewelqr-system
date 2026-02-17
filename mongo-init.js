// MongoDB initialization script
// Creates default admin user, settings, and indexes
// Runs once when the MongoDB container is first created

// Switch to jewelqr database
db = db.getSiblingDB('jewelqr');

// Create users collection with default admin and staff
db.users.insertMany([
    {
        username: 'admin',
        // Password: admin123 (bcrypt hashed)
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4/0d5kqvIYRWqG3O',
        name: 'Admin User',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        username: 'staff',
        // Password: staff123 (bcrypt hashed)
        password: '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        name: 'Staff Member',
        role: 'staff',
        createdAt: new Date(),
        updatedAt: new Date()
    }
]);

// Create indexes
db.users.createIndex({ username: 1 }, { unique: true });

// Create settings collection with defaults (v1.5.0+ schema)
db.settings.insertOne({
    _id: 'global_settings',

    // Diamond pricing — Map structure matching Settings.js (v1.5.0)
    diamondPricing: {
        solitaire: { label: 'Solitaire', realRate: 100000, cvdRate: 50000, isActive: true },
        rd: { label: 'RD', realRate: 50000, cvdRate: 25000, isActive: true },
        mq: { label: 'MQ (Marquise)', realRate: 45000, cvdRate: 22500, isActive: true },
        moti: { label: 'Moti', realRate: 40000, cvdRate: 20000, isActive: true },
        pear: { label: 'Pear', realRate: 42000, cvdRate: 21000, isActive: true },
        round: { label: 'Round', realRate: 38000, cvdRate: 19000, isActive: true }
    },

    // Legacy diamond types array (kept for backward compatibility)
    diamondTypes: [
        { id: 'solitaire', name: 'Solitaire', rateMultiplier: 1.0 },
        { id: 'rd', name: 'RD', rateMultiplier: 1.0 },
        { id: 'mq', name: 'MQ (Marquise)', rateMultiplier: 1.0 },
        { id: 'moti', name: 'Moti', rateMultiplier: 1.0 },
        { id: 'pear', name: 'Pear', rateMultiplier: 1.0 },
        { id: 'round', name: 'Round', rateMultiplier: 1.0 }
    ],

    // Jewelry categories
    jewelryCategories: [
        { id: 'chain', name: 'Chain', prefix: 'CHN', isActive: true },
        { id: 'bangles', name: 'Bangles', prefix: 'BNG', isActive: true },
        { id: 'earrings', name: 'Earrings', prefix: 'EAR', isActive: true },
        { id: 'necklace', name: 'Necklace', prefix: 'NCK', isActive: true },
        { id: 'pendant_set', name: 'Pendant Set', prefix: 'PND', isActive: true },
        { id: 'others', name: 'Others', prefix: 'OTH', isActive: true }
    ],

    // Rates (v1.3.0+ schema — labourRate replaces makingCharges)
    rates: {
        goldRate: 6500,
        diamondRate: 50000,
        cvdDiamondRate: 25000,
        labourRate: 500,
        taxPercent: 3
    },

    // Purity factors (v1.3.1)
    purityFactors: {
        '24K': 1.0,
        '22K': 0.9167,
        '18K': 0.75,
        '14K': 0.585
    },

    // QR code settings
    qrSettings: {
        size: 256,
        color: '#1A2332',
        background: '#FFFFFF',
        errorLevel: 'H'
    },

    createdAt: new Date(),
    updatedAt: new Date()
});

// Create items collection indexes
db.items.createIndex({ sku: 1 }, { unique: true });
db.items.createIndex({ 'category.id': 1 });
db.items.createIndex({ createdAt: -1 });
db.items.createIndex({ deletedAt: 1 });

print('Database initialized with default users and settings (v1.7.1)');
