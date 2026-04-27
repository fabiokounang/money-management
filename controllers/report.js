const report = require('../models/report');
const account = require('../models/account');
const category = require('../models/category');
const {
  parse_positive_int,
  sanitize_search,
  sanitize_enum,
  sanitize_date_yyyy_mm_dd,
  local_calendar_iso_date
} = require('../utils/validation');

function get_default_month_range() {
  const today = local_calendar_iso_date();
  const [yearRaw, monthRaw] = today.split('-');
  const currentYear = Number(yearRaw);
  const currentMonth = Number(monthRaw) - 1;
  const now = new Date(currentYear, currentMonth, 1);
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  function to_local_iso_date(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return {
    from_date: to_local_iso_date(first),
    to_date: to_local_iso_date(last)
  };
}

function normalize_range(from, to) {
  const def = get_default_month_range();
  let from_date = sanitize_date_yyyy_mm_dd(from) || def.from_date;
  let to_date = sanitize_date_yyyy_mm_dd(to) || def.to_date;

  if (from_date > to_date) {
    const temp = from_date;
    from_date = to_date;
    to_date = temp;
  }

  return { from_date, to_date };
}

function to_number_array(value) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  }

  const single = Number(value || 0);
  if (Number.isInteger(single) && single > 0) {
    return [single];
  }

  return [];
}

async function index(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const { from_date, to_date } = normalize_range(req.query.from_date, req.query.to_date);
    const transaction_type = sanitize_enum(req.query.transaction_type, ['income', 'expense', 'transfer'], '');
    const account_id = parse_positive_int(req.query.account_id, 0);
    const category_ids = to_number_array(req.query.category_ids);
    const trend_granularity = sanitize_enum(req.query.trend_granularity, ['day', 'month', 'year'], 'month');

    const [summary, category_summary, income_expense_trend, accounts, categories] = await Promise.all([
      report.get_summary(user_id, from_date, to_date, transaction_type, account_id),
      report.get_category_summary(user_id, from_date, to_date, transaction_type, account_id),
      report.get_income_expense_trend(user_id, from_date, to_date, trend_granularity, transaction_type, account_id),
      account.get_active_accounts(user_id),
      Promise.all([
        category.get_active_by_type(user_id, 'income'),
        category.get_active_by_type(user_id, 'expense')
      ]).then(([income_categories, expense_categories]) => [...income_categories, ...expense_categories])
    ]);

    const selected_categories_total = await report.get_selected_categories_total(
      user_id,
      from_date,
      to_date,
      transaction_type,
      account_id,
      category_ids
    );

    const total_income = Number(summary.total_income || 0);
    const total_expense = Number(summary.total_expense || 0);
    const total_transfer = Number(summary.total_transfer || 0);
    const net_balance = total_income - total_expense;

    return res.render('report/index', {
      title: 'Report',
      summary: {
        total_income,
        total_expense,
        total_transfer,
        net_balance,
        selected_categories_total: Number(selected_categories_total || 0)
      },
      accounts,
      categories,
      category_summary,
      income_expense_trend,
      trend_granularity,
      filters: {
        from_date,
        to_date,
        transaction_type,
        account_id,
        category_ids,
        trend_granularity
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  index
};