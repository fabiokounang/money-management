/**
 * Central display helpers: all user-facing dates/times use WIB (UTC+7).
 * MySQL DATETIME strings without a zone are treated as wall time in WIB.
 */

const DISPLAY_TZ = 'Asia/Jakarta';

function toInstant(value) {
    if (value == null || value === '') {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const s = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}T/.test(s) || s.endsWith('Z')) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
        const normalized = s.replace(' ', 'T');
        const withZone = /[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+07:00`;
        const d = new Date(withZone);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T00:00:00+07:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
    const d = toInstant(value);
    if (!d) {
        return '-';
    }

    const datePart = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(d);

    const timePart = new Intl.DateTimeFormat('en-US', {
        timeZone: DISPLAY_TZ,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(d);

    return `${datePart} ${timePart}`;
}

function formatDate(value) {
    const d = toInstant(value);
    if (!d) {
        return '-';
    }

    return new Intl.DateTimeFormat('id-ID', {
        timeZone: DISPLAY_TZ,
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    }).format(d);
}

function toDateInputValue(value) {
    const d = toInstant(value);
    if (!d) {
        return '';
    }

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: DISPLAY_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d);
}

module.exports = {
    DISPLAY_TZ,
    toInstant,
    formatDateTime,
    formatDate,
    toDateInputValue
};
