'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const log = require('./log');
const { ErpError } = require('./erp');
const { HttpError } = require('./http');
const auth = require('./auth');
const shopify = require('./shopify');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'img-src': ["'self'", 'data:', 'blob:', 'https://cdn.shopify.com'],
            'worker-src': ["'self'", 'blob:'],
            'connect-src': ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
app.use(compression());
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(config.cookieSecret));

app.get('/api/health', async (req, res) => {
    const erp = await fetch(`${config.erp.url}/api/method/ping`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok).catch(() => false);
    res.status(erp ? 200 : 503).json({ ok: erp, erpnext: erp ? 'up' : 'down', shopify: config.shopify.enabled ? 'configured' : 'off' });
});

app.use('/api/auth', auth.router);
app.use('/api/public', require('./routes/public'));
app.use('/api/items', auth.requireUser, require('./routes/items'));
app.use('/api/stock', auth.requireUser, require('./routes/stock'));
app.use('/api/dashboard', auth.requireUser, require('./routes/dashboard'));
app.use('/api/shopify', auth.requireUser, require('./routes/shopify'));
app.use('/api', auth.requireUser, require('./routes/masters'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Item images live in ERPNext's public files; proxy them so the browser only talks to this origin.
app.get('/files/*splat', async (req, res, next) => {
    // ERPNext public files are flat (/files/<name>); refuse anything that could walk elsewhere.
    if (!/^\/files\/[^/\\]+$/.test(req.path) || decodeURIComponent(req.path).includes('..')) return res.status(404).end();
    try {
        const upstream = await fetch(config.erp.url + req.originalUrl, { signal: AbortSignal.timeout(30_000) });
        if (!upstream.ok) return res.status(upstream.status).end();
        for (const h of ['content-type', 'content-length', 'last-modified', 'etag']) if (upstream.headers.get(h)) res.set(h, upstream.headers.get(h));
        res.set('Cache-Control', 'public, max-age=86400');
        Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) { next(err); }
});

// Production: serve the built web app (SPA fallback to index.html).
const dist = process.env.WEB_DIST || path.join(__dirname, '../../ims-web/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1y', setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
    app.get('/*splat', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    let status = err.status || 500;
    let message = err.message || 'Something went wrong';
    if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'Image is larger than 10 MB'; }
    if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON body'; }
    if (status === 401 && err instanceof ErpError && err.excType === 'SessionExpired') res.clearCookie(auth.COOKIE, { path: '/' });
    if (status >= 500 && !(err instanceof HttpError) && !(err instanceof ErpError)) {
        log.error({ err, url: req.originalUrl }, 'unhandled error');
        message = 'Something went wrong';
    } else if (status >= 500) {
        log.warn({ status, message, url: req.originalUrl }, 'upstream error');
    }
    res.status(status).json({ error: message });
});

if (require.main === module) {
    app.listen(config.port, () => {
        log.info(`IMS gateway on :${config.port} -> ERPNext ${config.erp.url}${config.shopify.enabled ? ` · Shopify ${config.shopify.shop}` : ''}`);
        shopify.startScheduler();
    });
}

module.exports = app;
