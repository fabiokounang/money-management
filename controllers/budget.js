const budget = require('../models/budget');
const category = require('../models/category');
const {
  normalize_page,
  normalize_is_active_filter,
  parse_positive_int,
  parse_non_negative_decimal,
  normalize_string,
  normalize_enum,
  parse_iso_date,
  is_valid_iso_date
} = require('../utils/validation');

const PERIOD_TYPES = new Set(['weekly', 'monthly', 'yearly', 'custom']);

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

    const [item, expense_categories] = await Promise.all([
      budget.find_by_id(id, user_id),
      category.get_active_by_type(user_id, 'expense')
    ]);

    if (!item) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budget');
    }

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

    const expense_categories = await category.get_active_by_type(user_id, 'expense');

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
  index,
  show_create,
  create,
  show_edit,
  update,
  remove
};