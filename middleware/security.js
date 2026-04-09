const rateBuckets = new Map();
let sweepCounter = 0;

function clientKey(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
}

function sweepExpiredBuckets() {
  sweepCounter += 1;
  if (sweepCounter % 200 !== 0) {
    return;
  }

  const now = Date.now();
  for (const [key, value] of rateBuckets.entries()) {
    if (!value || now >= value.resetAt) {
      rateBuckets.delete(key);
    }
  }
}

function create_rate_limiter(options = {}) {
  const windowMs = Number(options.windowMs || 60_000);
  const max = Number(options.max || 60);
  const message = String(options.message || 'Too many requests. Please try again in a moment.');
  const keyGenerator = typeof options.keyGenerator === 'function'
    ? options.keyGenerator
    : (req) => clientKey(req);

  return function rate_limit_middleware(req, res, next) {
    sweepExpiredBuckets();

    const now = Date.now();
    const key = `${String(options.name || 'default')}:${keyGenerator(req)}`;
    const existing = rateBuckets.get(key);

    if (!existing || now >= existing.resetAt) {
      rateBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      if (req.accepts('html')) {
        if (typeof req.flash === 'function') {
          req.flash('error_msg', message);
        }
        const back = req.get('referer') || '/';
        return res.redirect(back);
      }
      return res.status(429).json({
        success: false,
        message
      });
    }

    return next();
  };
}

function hasDangerousKey(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousKey(item));
  }

  for (const k of Object.keys(value)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      return true;
    }
    if (hasDangerousKey(value[k])) {
      return true;
    }
  }

  return false;
}

function collectUnexpectedKeys(payload, allowedKeys = []) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const allowed = new Set(allowedKeys);
  return Object.keys(payload).filter((k) => !allowed.has(k));
}

function rejectUnexpected(req, res, message) {
  if (req.accepts('html')) {
    if (typeof req.flash === 'function') {
      req.flash('error_msg', message);
    }
    return res.redirect(req.get('referer') || '/');
  }
  return res.status(400).json({
    success: false,
    message
  });
}

function allow_query_fields(allowedKeys = []) {
  return function allow_query_fields_mw(req, res, next) {
    const unexpected = collectUnexpectedKeys(req.query, allowedKeys);
    if (unexpected.length > 0) {
      return rejectUnexpected(req, res, `Unexpected query field(s): ${unexpected.join(', ')}`);
    }
    return next();
  };
}

function allow_body_fields(allowedKeys = []) {
  return function allow_body_fields_mw(req, res, next) {
    const unexpected = collectUnexpectedKeys(req.body, ['_csrf', ...allowedKeys]);
    if (unexpected.length > 0) {
      return rejectUnexpected(req, res, `Unexpected body field(s): ${unexpected.join(', ')}`);
    }
    return next();
  };
}

function enforce_request_payload_safety(req, res, next) {
  if (hasDangerousKey(req.query) || hasDangerousKey(req.params) || hasDangerousKey(req.body)) {
    if (req.accepts('html')) {
      if (typeof req.flash === 'function') {
        req.flash('error_msg', 'Invalid request payload');
      }
      return res.redirect(req.get('referer') || '/');
    }
    return res.status(400).json({
      success: false,
      message: 'Invalid request payload'
    });
  }

  return next();
}

function enforce_same_origin_for_unsafe_methods(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  const origin = String(req.headers.origin || '').trim();
  const referer = String(req.headers.referer || '').trim();
  const host = String(req.headers.host || '').trim();

  const isMatching = (urlText) => {
    if (!urlText) return true;
    try {
      const parsed = new URL(urlText);
      return parsed.host === host;
    } catch (err) {
      return false;
    }
  };

  if (!isMatching(origin) || !isMatching(referer)) {
    if (req.accepts('html')) {
      if (typeof req.flash === 'function') {
        req.flash('error_msg', 'Security check failed. Please refresh and try again.');
      }
      return res.redirect(req.get('referer') || '/');
    }
    return res.status(403).json({
      success: false,
      message: 'Blocked by origin policy'
    });
  }

  return next();
}

function enforce_csrf_token(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  const session_token = req.session ? String(req.session.csrf_token || '') : '';
  const body_token = req.body ? String(req.body._csrf || '') : '';
  const header_token = String(req.headers['x-csrf-token'] || '');
  const token = body_token || header_token;

  if (!session_token || !token || token !== session_token) {
    if (req.accepts('html')) {
      if (typeof req.flash === 'function') {
        req.flash('error_msg', 'Security token mismatch. Please refresh and try again.');
      }
      return res.redirect(req.get('referer') || '/');
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token'
    });
  }

  return next();
}

module.exports = {
  create_rate_limiter,
  allow_query_fields,
  allow_body_fields,
  enforce_request_payload_safety,
  enforce_same_origin_for_unsafe_methods,
  enforce_csrf_token
};
