// MongoDB initialization script
// Creates default admin user and settings

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

// Create settings collection with defaults
db.settings.insertOne({
    _id: 'global_settings',
    diamondTypes: [
        { id: 'moti', name: 'Moti', rateMultiplier: 1.0 },
        { id: 'pear', name: 'Pear', rateMultiplier: 1.0 },
        { id: 'markish', name: 'Markish', rateMultiplier: 1.0 },
        { id: 'round', name: 'Round', rateMultiplier: 1.0 }
    ],
    jewelryCategories: [
        { id: 'chain', name: 'Chain', prefix: 'CHN' },
        { id: 'bangles', name: 'Bangles', prefix: 'BNG' },
        { id: 'earrings', name: 'Earrings', prefix: 'EAR' },
        { id: 'necklace', name: 'Necklace', prefix: 'NCK' },
        { id: 'pendant_set', name: 'Pendant Set', prefix: 'PND' },
        { id: 'others', name: 'Others', prefix: 'OTH' }
    ],
    rates: {
        goldRate: 6500,
        diamondRate: 50000,
        cvdDiamondRate: 25000,
        makingCharges: 5000,
        taxPercent: 3
    },
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

print('Database initialized with default users and settings');
