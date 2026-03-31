function to_trimmed_string(value) {
  return String(value ?? '').trim();
}

function normalize_page(value) {
  const page = Number(value);

  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

function normalize_binary_filter(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return -1;
  }

  const parsed = Number(value);
  if (parsed === 0 || parsed === 1) {
    return parsed;
  }

  return -1;
}

function normalize_active_flag(value, default_value = 1) {
  const parsed = Number(value);

  if (parsed === 0) {
    return 0;
  }

  if (parsed === 1) {
    return 1;
  }

  return default_value === 0 ? 0 : 1;
}

function normalize_enum(value, allowed_values, fallback = '') {
  const normalized = to_trimmed_string(value);

  if (allowed_values.includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function parse_positive_int(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parse_optional_positive_int(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  return parse_positive_int(value);
}

function parse_positive_number(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parse_non_negative_number(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parse_iso_date(value) {
  const input = to_trimmed_string(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }

  const [year_raw, month_raw, day_raw] = input.split('-');
  const year = Number(year_raw);
  const month = Number(month_raw);
  const day = Number(day_raw);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const normalized_year = String(year);
  const normalized_month = String(month).padStart(2, '0');
  const normalized_day = String(day).padStart(2, '0');
  return `${normalized_year}-${normalized_month}-${normalized_day}`;
}

function normalize_iso_date_range(from_input, to_input, default_range) {
  let from_date = parse_iso_date(from_input) || default_range.from_date;
  let to_date = parse_iso_date(to_input) || default_range.to_date;

  if (from_date > to_date) {
    const temp = from_date;
    from_date = to_date;
    to_date = temp;
  }

  return { from_date, to_date };
}

function is_valid_email(email) {
  const value = to_trimmed_string(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalize_search_text(value, max_length = 100) {
  const normalized = to_trimmed_string(value);
  if (normalized.length <= max_length) {
    return normalized;
  }

  return normalized.slice(0, max_length);
}

module.exports = {
  to_trimmed_string,
  normalize_page,
  normalize_binary_filter,
  normalize_active_flag,
  normalize_enum,
  parse_positive_int,
  parse_optional_positive_int,
  parse_positive_number,
  parse_non_negative_number,
  parse_iso_date,
  normalize_iso_date_range,
  is_valid_email,
  normalize_search_text
};
