const { parse_iso_date } = require('./validation');

function to_date_string(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalize_period_range(period_type, start_date_input, end_date_input) {
  const start_date = parse_iso_date(start_date_input);
  const end_date = parse_iso_date(end_date_input);

  if (!start_date) {
    return {
      ok: false,
      message: 'Start date is invalid'
    };
  }

  if (period_type === 'custom') {
    if (!end_date) {
      return {
        ok: false,
        message: 'End date is invalid'
      };
    }

    if (start_date.getTime() > end_date.getTime()) {
      return {
        ok: false,
        message: 'Start date cannot be later than end date'
      };
    }

    return {
      ok: true,
      start_date: to_date_string(start_date),
      end_date: to_date_string(end_date)
    };
  }

  if (period_type === 'weekly') {
    const computed_end = new Date(start_date);
    computed_end.setDate(computed_end.getDate() + 6);

    return {
      ok: true,
      start_date: to_date_string(start_date),
      end_date: to_date_string(computed_end)
    };
  }

  if (period_type === 'monthly') {
    const first_day = new Date(start_date.getFullYear(), start_date.getMonth(), 1);
    const last_day = new Date(start_date.getFullYear(), start_date.getMonth() + 1, 0);

    return {
      ok: true,
      start_date: to_date_string(first_day),
      end_date: to_date_string(last_day)
    };
  }

  if (period_type === 'yearly') {
    const first_day = new Date(start_date.getFullYear(), 0, 1);
    const last_day = new Date(start_date.getFullYear(), 11, 31);

    return {
      ok: true,
      start_date: to_date_string(first_day),
      end_date: to_date_string(last_day)
    };
  }

  return {
    ok: false,
    message: 'Invalid period type'
  };
}

function next_period_after_end(period_type, end_date_input) {
  if (period_type === 'custom') {
    return {
      ok: false,
      message: 'Custom budgets do not auto-renew'
    };
  }

  const end_date = parse_iso_date(end_date_input);
  if (!end_date) {
    return {
      ok: false,
      message: 'End date is invalid'
    };
  }

  if (period_type === 'monthly') {
    const next_start = new Date(end_date.getFullYear(), end_date.getMonth() + 1, 1);
    return normalize_period_range('monthly', to_date_string(next_start), null);
  }

  if (period_type === 'weekly') {
    const next_start = new Date(end_date);
    next_start.setDate(next_start.getDate() + 1);
    return normalize_period_range('weekly', to_date_string(next_start), null);
  }

  if (period_type === 'yearly') {
    const next_start = new Date(end_date.getFullYear() + 1, 0, 1);
    return normalize_period_range('yearly', to_date_string(next_start), null);
  }

  return {
    ok: false,
    message: 'Invalid period type'
  };
}

module.exports = {
  to_date_string,
  normalize_period_range,
  next_period_after_end
};
