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

    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(d);

    const map = {};
    parts.forEach((p) => {
        if (p.type !== 'literal') {
            map[p.type] = p.value;
        }
    });

    return `${map.day || '00'}/${map.month || '00'}/${map.year || '0000'} ${map.hour || '00'}:${map.minute || '00'}:${map.second || '00'}`;
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

/**
 * Compact English range for budget recap, wall calendar in Asia/Jakarta (WIB).
 * Examples: "1–30 April 2026", "1 April – 1 May 2026", "30 Dec 2025 – 15 Jan 2026".
 */
function formatRecapDateRangeEn(startVal, endVal) {
    const d1 = toInstant(startVal);
    const d2 = toInstant(endVal);
    if (!d1 || !d2) {
        return '—';
    }

    const yearFmt = new Intl.DateTimeFormat('en', {
        timeZone: DISPLAY_TZ,
        year: 'numeric'
    });
    const monthNumFmt = new Intl.DateTimeFormat('en', {
        timeZone: DISPLAY_TZ,
        month: 'numeric'
    });
    const dayFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TZ,
        day: 'numeric'
    });
    const monthLongFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TZ,
        month: 'long'
    });
    const dayMonthLongFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TZ,
        day: 'numeric',
        month: 'long'
    });
    const fullFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TZ,
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const y1 = Number(yearFmt.format(d1));
    const y2 = Number(yearFmt.format(d2));
    const m1 = Number(monthNumFmt.format(d1));
    const m2 = Number(monthNumFmt.format(d2));

    if (y1 === y2 && m1 === m2) {
        const day1 = dayFmt.format(d1);
        const day2 = dayFmt.format(d2);
        const mon = monthLongFmt.format(d1);
        return `${day1}–${day2} ${mon} ${y1}`;
    }

    if (y1 === y2) {
        return `${dayMonthLongFmt.format(d1)} – ${dayMonthLongFmt.format(d2)} ${y1}`;
    }

    return `${fullFmt.format(d1)} – ${fullFmt.format(d2)}`;
}

module.exports = {
    DISPLAY_TZ,
    toInstant,
    formatDateTime,
    formatDate,
    toDateInputValue,
    formatRecapDateRangeEn
};
