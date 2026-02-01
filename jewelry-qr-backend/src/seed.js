/**
 * Database Seed Script
 * Creates default admin and staff users
 * Run with: node src/seed.js
 * RBAC v1.4.0: Users now have isActive and tokenVersion fields
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./config/env');

const User = require('./models/User');
const Settings = require('./models/Settings');

async function seed() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(config.mongoUri);
        console.log('Connected!');

        // Create admin user
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            await User.create({
                username: 'admin',
                password: 'admin123',
                name: 'Admin User',
                role: 'admin',
                isActive: true,
                tokenVersion: 0
            });
            console.log('✓ Created admin user (admin/admin123)');
        } else {
            // RBAC v1.4.0: Ensure existing admin has RBAC fields
            if (adminExists.isActive === undefined || adminExists.tokenVersion === undefined) {
                adminExists.isActive = true;
                adminExists.tokenVersion = adminExists.tokenVersion || 0;
                await adminExists.save();
                console.log('✓ Updated admin user with RBAC fields');
            } else {
                console.log('✓ Admin user already exists');
            }
        }

        // Create staff user
        const staffExists = await User.findOne({ username: 'staff' });
        if (!staffExists) {
            await User.create({
                username: 'staff',
                password: 'staff123',
                name: 'Staff Member',
                role: 'staff',
                isActive: true,
                tokenVersion: 0
            });
            console.log('✓ Created staff user (staff/staff123)');
        } else {
            // RBAC v1.4.0: Ensure existing staff has RBAC fields
            if (staffExists.isActive === undefined || staffExists.tokenVersion === undefined) {
                staffExists.isActive = true;
                staffExists.tokenVersion = staffExists.tokenVersion || 0;
                await staffExists.save();
                console.log('✓ Updated staff user with RBAC fields');
            } else {
                console.log('✓ Staff user already exists');
            }
        }

        // Initialize settings
        await Settings.getSettings();
        console.log('✓ Settings initialized');

        console.log('\n✅ Database seeded successfully!');
        console.log('\n📋 RBAC v1.4.0 Notes:');
        console.log('   - Admin can access all portal features');
        console.log('   - Staff can login but redirects to restricted page');
        console.log('   - Scan page is public (no login required)');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        process.exit(1);
    }
}

seed();
