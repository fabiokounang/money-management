const budget = require('../models/budget');
const category = require('../models/category');
const displayTime = require('../utils/displayTime');
const {
  normalize_page,
  normalize_is_active_filter,
  parse_positive_int,
  parse_non_negative_decimal,
  normalize_string,
  normalize_enum,
  parse_iso_date,
  is_valid_iso_date,
  normalize_date_range
} = require('../utils/validation');

const PERIOD_TYPES = new Set(['weekly', 'monthly', 'yearly', 'custom']);

function get_default_month_range() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  // Use calendar dates in the server local TZ — toISOString() is UTC and shifts
  // the day for timezones ahead of UTC (e.g. WIB: month end becomes yesterday).
  return {
    from_date: to_date_string(first),
    to_date: to_date_string(last)
  };
}

function format_date_for_input(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

async function recap(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const range = normalize_date_range(
      req.query.from_date,
      req.query.to_date,
      get_default_month_range()
    );

    if (!range.ok) {
      req.flash('error_msg', range.error);
      return res.redirect('/budget/recap');
    }

    const { from_date, to_date } = range;
    const raw_rows = await budget.get_recap_by_date_range(user_id, from_date, to_date);

    function format_recap_calendar_date(value) {
      const s = displayTime.toDateInputValue(value);
      return s || '—';
    }

    const recap_rows = raw_rows.map((r) => {
      const cap = Number(r.budget_amount || 0);
      const spent = Number(r.spent || 0);
      const remaining = cap - spent;
      const pct_used = cap > 0 ? Math.min(999, Math.round((spent / cap) * 1000) / 10) : 0;

      let status_key = 'ok';
      let status_label = 'Within budget';
      if (cap <= 0) {
        status_key = 'na';
        status_label = '—';
      } else if (spent > cap) {
        status_key = 'over';
        status_label = 'Over budget';
      } else if (spent >= cap * 0.8) {
        status_key = 'near';
        status_label = 'Near limit (≥80%)';
      } else if (spent <= 0) {
        status_key = 'quiet';
        status_label = 'No spending';
      }

      return {
        ...r,
        budget_start: format_recap_calendar_date(r.budget_start),
        budget_end: format_recap_calendar_date(r.budget_end),
        slice_from: format_recap_calendar_date(r.slice_from),
        slice_to: format_recap_calendar_date(r.slice_to),
        budget_period_label: displayTime.formatRecapDateRangeEn(r.budget_start, r.budget_end),
        counted_period_label: displayTime.formatRecapDateRangeEn(r.slice_from, r.slice_to),
        spent,
        cap,
        remaining,
        pct_used,
        status_key,
        status_label
      };
    });

    recap_rows.sort((a, b) => {
      function rank(row) {
        if (row.status_key === 'over') return 0;
        if (row.status_key === 'near') return 1;
        if (row.status_key === 'ok') return 2;
        if (row.status_key === 'quiet') return 3;
        return 4;
      }

      const d = rank(a) - rank(b);
      if (d !== 0) {
        return d;
      }

      return String(a.category_name).localeCompare(String(b.category_name));
    });

    let over_count = 0;
    let near_count = 0;
    let ok_count = 0;
    let quiet_count = 0;

    recap_rows.forEach((row) => {
      if (row.status_key === 'over') {
        over_count += 1;
      } else if (row.status_key === 'near') {
        near_count += 1;
      } else if (row.status_key === 'ok') {
        ok_count += 1;
      } else if (row.status_key === 'quiet') {
        quiet_count += 1;
      }
    });

    const total_cap = recap_rows.reduce((sum, r) => sum + r.cap, 0);
    const total_spent = recap_rows.reduce((sum, r) => sum + r.spent, 0);
    const total_remaining = total_cap - total_spent;

    const insights = [];
    if (recap_rows.length === 0) {
      insights.push('No budgets overlap this date range. Add budgets on the Budgets page or change the range.');
    } else {
      if (over_count === 0 && near_count === 0) {
        insights.push('All categories are still below 80% of their limits (for spending in the selected range).');
      } else {
        if (over_count > 0) {
          insights.push(`${over_count} budget(s) are over limit for spending in this range.`);
        }
        if (near_count > 0) {
          insights.push(`${near_count} budget(s) are at ≥80% of limit — watch the rest of the period.`);
        }
      }

      if (total_remaining >= 0) {
        insights.push(
          `Combined headroom (sum of limits minus actual in the overlap): Rp ${total_remaining.toLocaleString('id-ID')}.`
        );
      } else {
        insights.push(
          `In aggregate, actual exceeds total limits by about Rp ${Math.abs(total_remaining).toLocaleString('id-ID')} — check the “Over budget” rows.`
        );
      }
    }

    return res.render('budget/recap', {
      title: 'Recap',
      recap_rows,
      summary: {
        over_count,
        near_count,
        ok_count,
        quiet_count,
        total_rows: recap_rows.length,
        total_cap,
        total_spent,
        total_remaining
      },
      insights,
      filters: {
        from_date,
        to_date
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function index(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const page = normalize_page(req.query.page);
    const limit = 10;
    const offset = (page - 1) * limit;

    const search = normalize_string(req.query.search, 120);
    const period_type = normalize_enum(req.query.period_type, PERIOD_TYPES);
    const is_active = normalize_is_active_filter(req.query.is_active);

    const [budgets, total, totals] = await Promise.all([
      budget.get_list(user_id, limit, offset, search, period_type, is_active),
      budget.count_all(user_id, search, period_type, is_active),
      budget.get_totals(user_id, search, period_type, is_active)
    ]);

    const budget_ids = budgets.map((item) => Number(item.id || 0)).filter((id) => id > 0);
    const actual_rows = await budget.get_actual_amount_by_budget_ids(user_id, budget_ids);
    const actual_map = {};

    actual_rows.forEach((item) => {
      actual_map[String(item.id)] = Number(item.actual_amount || 0);
    });

    const total_pages = Math.max(Math.ceil(total / limit), 1);

    const monthly_equivalent_total =
      Number(totals.monthly_budget_amount || 0) +
      (Number(totals.weekly_budget_amount || 0) * 4.34524) +
      (Number(totals.yearly_budget_amount || 0) / 12) +
      Number(totals.custom_budget_amount || 0);

    return res.render('budget/index', {
      title: 'Budgets',
      budgets,
      budget_actual_map: actual_map,
      summary_stats: {
        total_budget_amount: Number(totals.total_budget_amount || 0),
        total_weekly_budget_amount: Number(totals.weekly_budget_amount || 0),
        total_monthly_budget_amount: Number(totals.monthly_budget_amount || 0),
        total_yearly_budget_amount: Number(totals.yearly_budget_amount || 0),
        total_custom_budget_amount: Number(totals.custom_budget_amount || 0),
        monthly_equivalent_total,
        total_actual_amount: Number(totals.total_actual_amount || 0),
        over_budget_count: Number(totals.over_budget_count || 0)
      },
      page,
      limit,
      total,
      total_pages,
      filters: {
        search,
        period_type,
        is_active
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function show_create(req, res, next) {
  try {
    const user_id = req.session.user.id;

    const expense_categories = await category.get_active_by_type(user_id, 'expense');

    return res.render('budget/create', {
      title: 'Create Budget',
      error: null,
      old: {},
      categories: expense_categories
    });
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const category_id = parse_positive_int(req.body.category_id);
    const amount = parse_non_negative_decimal(req.body.amount);
    const period_type = normalize_enum(req.body.period_type, PERIOD_TYPES);
    const start_date = normalize_string(req.body.start_date, 10);
    const end_date = normalize_string(req.body.end_date, 10);
    const note = normalize_string(req.body.note, 1000);
    const is_active = Number(req.body.is_active || 1);

    const expense_categories = await category.get_active_by_type(user_id, 'expense');

    const old = {
      category_id,
      amount,
      period_type,
      start_date,
      end_date,
      note,
      is_active
    };

    if (!category_id || Number.isNaN(amount) || !period_type || !start_date) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Please fill all required fields',
        old,
        categories: expense_categories
      });
    }

    if (amount <= 0) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Amount must be greater than zero',
        old,
        categories: expense_categories
      });
    }

    if (!is_valid_iso_date(start_date)) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Start date is invalid',
        old,
        categories: expense_categories
      });
    }

    if (period_type === 'custom' && !is_valid_iso_date(end_date)) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'End date is invalid',
        old,
        categories: expense_categories
      });
    }

    const normalized_period = normalize_period_range(period_type, start_date, end_date);

    if (!normalized_period.ok) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: normalized_period.message,
        old,
        categories: expense_categories
      });
    }

    const category_item = await category.find_by_id(category_id, user_id);

    if (!category_item || category_item.category_type !== 'expense') {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Selected category must be a valid expense category',
        old,
        categories: expense_categories
      });
    }

    const duplicate = await budget.find_duplicate(
      user_id,
      category_id,
      period_type,
      normalized_period.start_date,
      normalized_period.end_date,
      0
    );

    if (duplicate) {
      return res.status(409).render('budget/create', {
        title: 'Create Budget',
        error: 'Budget with the same category and period already exists',
        old,
        categories: expense_categories
      });
    }

    const overlap = await budget.find_overlapping_period(
      user_id,
      category_id,
      normalized_period.start_date,
      normalized_period.end_date,
      0
    );

    if (overlap) {
      return res.status(409).render('budget/create', {
        title: 'Create Budget',
        error: 'Budget period overlaps with an existing budget for this category',
        old,
        categories: expense_categories
      });
    }

    await budget.create({
      user_id,
      category_id,
      amount,
      period_type,
      start_date: normalized_period.start_date,
      end_date: normalized_period.end_date,
      note,
      is_active: is_active === 0 ? 0 : 1
    });

    req.flash('success_msg', 'Budget created successfully');
    return res.redirect('/budget');
  } catch (error) {
    return next(error);
  }
}

async function show_edit(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = parse_positive_int(req.params.id);

    if (!id) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budget');
    }

    const item = await budget.find_by_id(id, user_id);

    if (!item) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budget');
    }

    const expense_categories = await category.list_expense_categories_for_budget_form(
      user_id,
      item.category_id
    );

    return res.render('budget/edit', {
      title: 'Edit Budget',
      error: null,
      budget_item: {
        ...item,
        start_date: format_date_for_input(item.start_date),
        end_date: format_date_for_input(item.end_date)
      },
      categories: expense_categories
    });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = parse_positive_int(req.params.id);
    const category_id = parse_positive_int(req.body.category_id);
    const amount = parse_non_negative_decimal(req.body.amount);
    const period_type = normalize_enum(req.body.period_type, PERIOD_TYPES);
    const start_date = normalize_string(req.body.start_date, 10);
    const end_date = normalize_string(req.body.end_date, 10);
    const note = normalize_string(req.body.note, 1000);
    const is_active = Number(req.body.is_active || 1);

    const old = {
      id,
      category_id,
      amount,
      period_type,
      start_date,
      end_date,
      note,
      is_active
    };

    const expense_categories = await category.list_expense_categories_for_budget_form(
      user_id,
      category_id
    );

    if (!id || !category_id || Number.isNaN(amount) || !period_type || !start_date) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Please fill all required fields',
        budget_item: old,
        categories: expense_categories
      });
    }

    if (amount <= 0) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Amount must be greater than zero',
        budget_item: old,
        categories: expense_categories
      });
    }

    if (!is_valid_iso_date(start_date)) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Start date is invalid',
        budget_item: old,
        categories: expense_categories
      });
    }

    if (period_type === 'custom' && !is_valid_iso_date(end_date)) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'End date is invalid',
        budget_item: old,
        categories: expense_categories
      });
    }

    const normalized_period = normalize_period_range(period_type, start_date, end_date);

    if (!normalized_period.ok) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: normalized_period.message,
        budget_item: old,
        categories: expense_categories
      });
    }

    const item = await budget.find_by_id(id, user_id);

    if (!item) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budget');
    }

    const category_item = await category.find_by_id(category_id, user_id);

    if (!category_item || category_item.category_type !== 'expense') {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Selected category must be a valid expense category',
        budget_item: old,
        categories: expense_categories
      });
    }

    const duplicate = await budget.find_duplicate(
      user_id,
      category_id,
      period_type,
      normalized_period.start_date,
      normalized_period.end_date,
      id
    );

    if (duplicate) {
      return res.status(409).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Budget with the same category and period already exists',
        budget_item: old,
        categories: expense_categories
      });
    }

    const overlap = await budget.find_overlapping_period(
      user_id,
      category_id,
      normalized_period.start_date,
      normalized_period.end_date,
      id
    );

    if (overlap) {
      return res.status(409).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Budget period overlaps with an existing budget for this category',
        budget_item: old,
        categories: expense_categories
      });
    }

    await budget.update({
      id,
      user_id,
      category_id,
      amount,
      period_type,
      start_date: normalized_period.start_date,
      end_date: normalized_period.end_date,
      note,
      is_active: is_active === 0 ? 0 : 1
    });

    req.flash('success_msg', 'Budget updated successfully');
    return res.redirect('/budget');
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = parse_positive_int(req.params.id);

    if (!id) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budget');
    }

    const item = await budget.find_by_id(id, user_id);

    if (!item) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budget');
    }

    await budget.remove(id, user_id);

    req.flash('success_msg', 'Budget deleted successfully');
    return res.redirect('/budget');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  recap,
  index,
  show_create,
  create,
  show_edit,
  update,
  remove
};