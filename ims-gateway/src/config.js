'use strict';
require('dotenv').config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name) {
    if (!env[name]) throw new Error(`Missing required env var ${name} (see .env.example)`);
    return env[name];
}

const config = {
    isProd,
    port: Number(env.PORT) || 3000,
    // Signs the session cookie. Must be long and random in production.
    cookieSecret: isProd ? required('COOKIE_SECRET') : (env.COOKIE_SECRET || 'dev-only-cookie-secret-change-me-0123456789'),
    // Public base URL printed into QR labels, e.g. https://ims.esmecrystal.com
    publicUrl: (env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    erp: {
        url: (env.ERP_URL || 'http://localhost:8085').replace(/\/$/, ''),
        // Service account (Stock Manager + Item Manager) for the public scan page and scheduled Shopify sync.
        apiKey: env.ERP_API_KEY || '',
        apiSecret: env.ERP_API_SECRET || '',
        company: env.ERP_COMPANY || 'Esme Crystal',
        sellingPriceList: env.ERP_SELLING_PRICE_LIST || 'Standard Selling',
    },
    shopify: {
        shop: env.SHOPIFY_SHOP || '', // esme-crystal.myshopify.com
        // Either a static Admin API token, or Dev Dashboard client credentials (token refreshed automatically).
        accessToken: env.SHOPIFY_ACCESS_TOKEN || '',
        clientId: env.SHOPIFY_CLIENT_ID || '',
        clientSecret: env.SHOPIFY_CLIENT_SECRET || '',
        apiVersion: env.SHOPIFY_API_VERSION || '2026-10',
        syncMinutes: Number(env.SHOPIFY_SYNC_MINUTES) || 0, // 0 = manual sync only
    },
};

config.shopify.enabled = Boolean(config.shopify.shop && (config.shopify.accessToken || (config.shopify.clientId && config.shopify.clientSecret)));

module.exports = config;
