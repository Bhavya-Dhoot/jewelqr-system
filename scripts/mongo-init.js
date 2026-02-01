// MongoDB Initialization Script
// Creates application user with limited permissions

// Switch to admin database for authentication
db = db.getSiblingDB('admin');

// Create application-specific user (not root)
db.createUser({
    user: 'jewelqr_user',
    pwd: process.env.MONGO_APP_PASSWORD || 'CHANGE_THIS_PASSWORD',
    roles: [
        {
            role: 'readWrite',
            db: 'jewelqr'
        }
    ]
});

// Switch to application database
db = db.getSiblingDB('jewelqr');

// Create indexes for performance
db.items.createIndex({ sku: 1 }, { unique: true });
db.items.createIndex({ deletedAt: 1 });
db.items.createIndex({ createdAt: -1 });
db.items.createIndex({ 'category.id': 1 });

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });

print('MongoDB initialization complete');
