function to_trimmed_string(value) {
  return String(value ?? '').trim();
}

function normalize_text(value, max_length = 255) {
  const normalized = to_trimmed_string(value);
  if (normalized.length <= max_length) {
    return normalized;
  }

  return normalized.slice(0, max_length);
}

function normalize_optional_text(value, max_length = 255) {
  const normalized = normalize_text(value, max_length);
  return normalized === '' ? null : normalized;
}

function normalize_string(value, max_length = 255) {
  return normalize_text(value, max_length);
}

function normalize_page(value) {
  const page = Number(value);

  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

function normalize_pagination_page(value) {
  return normalize_page(value);
}

function clamp_page(value, min = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    return min;
  }

  return parsed;
}

function parse_positive_int(value, default_value = null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return default_value;
  }

  return parsed;
}

function parse_positive_integer(value, default_value = null) {
  return parse_positive_int(value, default_value);
}

function parse_optional_positive_int(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  return parse_positive_int(value);
}

function normalize_positive_int(value, options = {}) {
  const { required = true, defaultValue = null } = options;
  const raw = to_trimmed_string(value);

  if (!required && raw === '') {
    return { ok: true, value: defaultValue };
  }

  const parsed = parse_positive_int(raw);
  if (parsed === null) {
    return { ok: false, value: defaultValue };
  }

  return { ok: true, value: parsed };
}

function parse_non_negative_int(value, default_value = null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return default_value;
  }

  return parsed;
}

function parse_positive_decimal(value, options = {}) {
  const { allow_zero = false } = options;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (allow_zero ? parsed < 0 : parsed <= 0) {
    return null;
  }

  return parsed;
}

function parse_positive_number(value) {
  return parse_positive_decimal(value);
}

function parse_non_negative_number(value) {
  return parse_positive_decimal(value, { allow_zero: true });
}

function parse_non_negative_decimal(value) {
  return parse_non_negative_number(value);
}

function parse_status_filter(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return -1;
  }

  const parsed = Number(value);
  if (parsed === 0 || parsed === 1) {
    return parsed;
  }

  return -1;
}

function normalize_binary_filter(value) {
  return parse_status_filter(value);
}

function normalize_flag_filter(value) {
  return parse_status_filter(value);
}

function parse_active_filter(value, default_value = -1) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return default_value;
  }

  const parsed = Number(value);

  if (parsed === 0) {
    return 0;
  }

  if (parsed === 1) {
    return 1;
  }

  return default_value;
}

function normalize_active_filter(value, default_value = -1) {
  return parse_active_filter(value, default_value);
}

function normalize_is_active_filter(value, default_value = -1) {
  return parse_active_filter(value, default_value);
}

function normalize_active_flag(value, default_value = 1) {
  return parse_active_filter(value, default_value === 0 ? 0 : 1);
}

function parse_is_active(value, default_value = 1) {
  return parse_active_filter(value, default_value === 0 ? 0 : 1);
}

function parse_enum(value, allowed_values, default_value = '') {
  const normalized = to_trimmed_string(value);
  const enum_values = Array.isArray(allowed_values)
    ? allowed_values
    : Array.from(allowed_values || []);

  if (enum_values.includes(normalized)) {
    return normalized;
  }

  return default_value;
}

function normalize_enum(value, allowed_values, fallback = '') {
  return parse_enum(value, allowed_values, fallback);
}

function sanitize_enum(value, allowed_values, fallback = '') {
  return parse_enum(value, allowed_values, fallback);
}

function is_valid_enum(value, allowed_values) {
  const normalized = to_trimmed_string(value);
  if (allowed_values instanceof Set) {
    return allowed_values.has(normalized);
  }

  return Array.isArray(allowed_values) && allowed_values.includes(normalized);
}

function is_valid_iso_date(value) {
  const input = to_trimmed_string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return false;
  }

  const [year_raw, month_raw, day_raw] = input.split('-');
  const year = Number(year_raw);
  const month = Number(month_raw);
  const day = Number(day_raw);
  const date = new Date(year, month - 1, day);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parse_iso_date(value) {
  if (!is_valid_iso_date(value)) {
    return null;
  }

  const [year_raw, month_raw, day_raw] = to_trimmed_string(value).split('-');
  return new Date(Number(year_raw), Number(month_raw) - 1, Number(day_raw));
}

// YYYY-MM-DD in local calendar (avoid UTC toISOString day shift on WIB, etc.).
function local_calendar_iso_date(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitize_date_yyyy_mm_dd(value, default_value = '') {
  const normalized = to_trimmed_string(value);
  if (!normalized) {
    return default_value;
  }

  return is_valid_iso_date(normalized) ? normalized : default_value;
}

function is_allowed_date(value) {
  return is_valid_iso_date(value);
}

function normalize_iso_date_range(from_input, to_input, default_range) {
  let from_date = sanitize_date_yyyy_mm_dd(from_input, '') || default_range.from_date;
  let to_date = sanitize_date_yyyy_mm_dd(to_input, '') || default_range.to_date;

  if (from_date > to_date) {
    const temp = from_date;
    from_date = to_date;
    to_date = temp;
  }

  return { ok: true, from_date, to_date };
}

function normalize_range(from_input, to_input, default_range) {
  return normalize_iso_date_range(from_input, to_input, default_range);
}

function normalize_date_range(from_input, to_input, default_range = null) {
  const today = local_calendar_iso_date();
  const fallback = default_range && default_range.from_date && default_range.to_date
    ? default_range
    : { from_date: today, to_date: today };

  const from_date_raw = to_trimmed_string(from_input);
  const to_date_raw = to_trimmed_string(to_input);

  if (from_date_raw && !is_valid_iso_date(from_date_raw)) {
    return { ok: false, error: 'Invalid from_date' };
  }

  if (to_date_raw && !is_valid_iso_date(to_date_raw)) {
    return { ok: false, error: 'Invalid to_date' };
  }

  let from_date = from_date_raw || fallback.from_date;
  let to_date = to_date_raw || fallback.to_date;

  if (from_date > to_date) {
    const temp = from_date;
    from_date = to_date;
    to_date = temp;
  }

  return { ok: true, from_date, to_date };
}

function normalize_search_text(value, max_length = 100) {
  return normalize_text(value, max_length);
}

function normalize_search(value, max_length = 100) {
  return normalize_search_text(value, max_length);
}

function sanitize_search(value, max_length = 100) {
  return normalize_search_text(value, max_length);
}

function normalize_trimmed_text(value, max_length = 255) {
  return normalize_text(value, max_length);
}

function is_valid_email(email) {
  const value = to_trimmed_string(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function is_safe_text(value) {
  const text = to_trimmed_string(value);
  return text.length > 0 && !/[<>]/.test(text);
}

module.exports = {
  to_trimmed_string,
  normalize_text,
  normalize_optional_text,
  normalize_string,
  normalize_page,
  normalize_pagination_page,
  clamp_page,
  parse_positive_int,
  parse_positive_integer,
  parse_optional_positive_int,
  normalize_positive_int,
  parse_non_negative_int,
  parse_positive_decimal,
  parse_positive_number,
  parse_non_negative_number,
  parse_non_negative_decimal,
  parse_status_filter,
  normalize_binary_filter,
  normalize_flag_filter,
  parse_active_filter,
  normalize_active_filter,
  normalize_is_active_filter,
  normalize_active_flag,
  parse_is_active,
  parse_enum,
  normalize_enum,
  sanitize_enum,
  is_valid_enum,
  is_valid_iso_date,
  parse_iso_date,
  local_calendar_iso_date,
  sanitize_date_yyyy_mm_dd,
  is_allowed_date,
  normalize_iso_date_range,
  normalize_range,
  normalize_date_range,
  normalize_search_text,
  normalize_search,
  sanitize_search,
  normalize_trimmed_text,
  is_valid_email,
  is_safe_text
};
