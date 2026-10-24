'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const config = require('./config');
const { client, login } = require('./erp');
const { validate, wrap } = require('./http');

const COOKIE = 'esme_sid';
const MANAGER_ROLES = ['System Manager', 'Stock Manager'];

const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    signed: true,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
};

async function loadUser(erp, email) {
    const [user, roles] = await Promise.all([
        erp.get('User', email),
        erp.call('frappe.core.doctype.user.user.get_current_user_roles'),
    ]);
    return {
        email,
        fullName: user.full_name || email,
        roles,
        isManager: roles.some(r => MANAGER_ROLES.includes(r)),
    };
}

/** Attaches req.erp (user-scoped ERPNext client) or responds 401. */
function requireUser(req, res, next) {
    const sid = req.signedCookies[COOKIE];
    if (!sid) return res.status(401).json({ error: 'Please sign in' });
    req.erp = client({ sid });
    req.sid = sid;
    next();
}

/** For actions the gateway performs with the service account (Shopify), check the caller is a manager. */
const requireManager = wrap(async (req, res, next) => {
    const email = await req.erp.call('frappe.auth.get_logged_user');
    req.user = await loadUser(req.erp, email);
    if (!req.user.isManager) return res.status(403).json({ error: 'Only Stock Managers can do this' });
    next();
});

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });

router.post('/login', loginLimiter, wrap(async (req, res) => {
    const { email, password } = validate(req.body, Joi.object({ email: Joi.string().trim().max(140).required(), password: Joi.string().max(200).required() }));
    const { sid } = await login(email, password);
    const erp = client({ sid });
    const user = await loadUser(erp, await erp.call('frappe.auth.get_logged_user'));
    res.cookie(COOKIE, sid, cookieOptions);
    res.json({ user });
}));

router.post('/logout', wrap(async (req, res) => {
    const sid = req.signedCookies[COOKIE];
    if (sid) await client({ sid }).call('logout').catch(() => { /* already expired */ });
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    res.status(204).end();
}));

router.get('/me', requireUser, wrap(async (req, res) => {
    const email = await req.erp.call('frappe.auth.get_logged_user');
    if (!email || email === 'Guest') return res.status(401).json({ error: 'Session expired' });
    res.json({ user: await loadUser(req.erp, email) });
}));

module.exports = { router, requireUser, requireManager, COOKIE };
