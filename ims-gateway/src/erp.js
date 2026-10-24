'use strict';
// Thin ERPNext (Frappe) REST client.
// User calls carry the user's own ERPNext session (sid), so ERPNext role permissions and the
// audit trail (owner / modified_by) stay per person. Background jobs use the service API key.

const config = require('./config');

class ErpError extends Error {
    constructor(status, message, excType) {
        super(message);
        this.status = status;
        this.excType = excType;
    }
}

const stripHtml = s => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function errorMessage(status, body) {
    try {
        if (body._server_messages) {
            const msgs = JSON.parse(body._server_messages).map(m => JSON.parse(m).message).filter(Boolean);
            if (msgs.length) return stripHtml(msgs.join(' '));
        }
    } catch { /* fall through */ }
    if (body.exception) return stripHtml(String(body.exception).replace(/^[\w.]+:\s*/, ''));
    if (typeof body.message === 'string') return stripHtml(body.message);
    return `ERPNext request failed (${status})`;
}

function mapStatus(status, excType) {
    if (excType === 'DoesNotExistError') return 404;
    if (excType === 'DuplicateEntryError' || excType === 'UniqueValidationError') return 409;
    if (excType === 'PermissionError' || excType === 'CSRFTokenError') return 403;
    if (excType === 'AuthenticationError' || excType === 'SessionExpired') return 401;
    if (excType === 'ValidationError' || excType === 'MandatoryError' || excType === 'LinkValidationError') return 422;
    return status >= 500 ? 502 : status;
}

const enc = encodeURIComponent;

/**
 * @param {{sid?: string, csrf?: string}} [session] omit for the service account
 */
function client(session) {
    const auth = {};
    if (session?.sid) {
        auth.Cookie = `sid=${session.sid}`;
        if (session.csrf) auth['X-Frappe-CSRF-Token'] = session.csrf;
    } else {
        if (!config.erp.apiKey) throw new ErpError(503, 'ERPNext service account is not configured (ERP_API_KEY / ERP_API_SECRET)');
        auth.Authorization = `token ${config.erp.apiKey}:${config.erp.apiSecret}`;
    }

    async function request(method, path, body, extraHeaders) {
        let res;
        try {
            res = await fetch(config.erp.url + path, {
                method,
                headers: { Accept: 'application/json', ...auth, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
                body: body instanceof FormData ? body : body && JSON.stringify(body),
                signal: AbortSignal.timeout(60_000),
            });
        } catch (err) {
            throw new ErpError(503, `ERPNext is unreachable at ${config.erp.url} (${err.cause?.code || err.name})`);
        }
        const text = await res.text();
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text.slice(0, 300) }; }
        if (!res.ok) {
            // A Guest call to a protected resource means the user's session expired.
            const excType = json.exc_type || (res.status === 403 && session?.sid && /not permitted|login/i.test(text) && /guest/i.test(text) ? 'SessionExpired' : undefined);
            throw new ErpError(mapStatus(res.status, excType), errorMessage(res.status, json), excType);
        }
        return json;
    }

    const api = {
        request,
        async get(doctype, name) {
            return (await request('GET', `/api/resource/${enc(doctype)}/${enc(name)}`)).data;
        },
        async list(doctype, { fields = ['name'], filters, orFilters, orderBy, limit = 20, start = 0, groupBy } = {}) {
            const q = new URLSearchParams({ fields: JSON.stringify(fields), limit_page_length: String(limit), limit_start: String(start) });
            if (filters) q.set('filters', JSON.stringify(filters));
            if (orFilters) q.set('or_filters', JSON.stringify(orFilters));
            if (orderBy) q.set('order_by', orderBy);
            if (groupBy) q.set('group_by', groupBy);
            return (await request('GET', `/api/resource/${enc(doctype)}?${q}`)).data;
        },
        async count(doctype, filters) {
            return (await api.call('frappe.client.get_count', { doctype, filters })) || 0;
        },
        async insert(doc) {
            return (await request('POST', `/api/resource/${enc(doc.doctype)}`, doc)).data;
        },
        async update(doctype, name, patch) {
            return (await request('PUT', `/api/resource/${enc(doctype)}/${enc(name)}`, patch)).data;
        },
        async remove(doctype, name) {
            await request('DELETE', `/api/resource/${enc(doctype)}/${enc(name)}`);
        },
        async exists(doctype, name) {
            try { await request('GET', `/api/resource/${enc(doctype)}/${enc(name)}?fields=["name"]`); return true; } catch (e) { if (e.status === 404) return false; throw e; }
        },
        async call(method, args = {}) {
            return (await request('POST', `/api/method/${method}`, args)).message;
        },
        async getSingle(doctype) {
            return (await request('GET', `/api/resource/${enc(doctype)}/${enc(doctype)}`)).data;
        },
        /** Upload a file and attach it to a document. Returns the File doc. */
        async upload({ buffer, filename, contentType, doctype, docname, fieldname, isPrivate = false }) {
            const form = new FormData();
            form.append('file', new Blob([buffer], { type: contentType }), filename);
            form.append('is_private', isPrivate ? '1' : '0');
            if (doctype) form.append('doctype', doctype);
            if (docname) form.append('docname', docname);
            if (fieldname) form.append('fieldname', fieldname);
            return (await request('POST', '/api/method/upload_file', form)).message;
        },
    };
    return api;
}

/** Log in with ERPNext credentials. Returns the session id and display name. */
async function login(usr, pwd) {
    let res;
    try {
        res = await fetch(`${config.erp.url}/api/method/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ usr, pwd }),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (err) {
        throw new ErpError(503, `ERPNext is unreachable at ${config.erp.url} (${err.cause?.code || err.name})`);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ErpError(401, 'Incorrect email or password', 'AuthenticationError');
    const sid = res.headers.getSetCookie().map(c => /^sid=([^;]*)/.exec(c)?.[1]).find(Boolean);
    if (!sid || sid === 'Guest') throw new ErpError(401, 'ERPNext did not start a session', 'AuthenticationError');
    return { sid, fullName: body.full_name };
}

module.exports = { client, login, ErpError };
