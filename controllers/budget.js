const budget = require('../models/budget');
const category = require('../models/category');

async function index(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const search = (req.query.search || '').trim();
    const period_type = req.query.period_type || '';
    const is_active = req.query.is_active === undefined || req.query.is_active === '' ?
      -1 :
      Number(req.query.is_active);

    const [budgets, total, budget_actual_summary] = await Promise.all([
      budget.get_list(user_id, limit, offset, search, period_type, is_active),
      budget.count_all(user_id, search, period_type, is_active),
      budget.get_budget_actual_summary(user_id, search, period_type, is_active)
    ]);

    const total_pages = Math.max(Math.ceil(total / limit), 1);

    return res.render('budget/index', {
      title: 'Budgets',
      budgets,
      budget_actual_summary,
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
    const category_id = Number(req.body.category_id || 0);
    const amount = Number(req.body.amount || 0);
    const period_type = req.body.period_type || '';
    const start_date = req.body.start_date || '';
    const end_date = req.body.end_date || '';
    const note = (req.body.note || '').trim();
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

    if (!category_id || !amount || !period_type || !start_date || !end_date) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Please fill all required fields',
        old,
        categories: expense_categories
      });
    }

    if (!['weekly', 'monthly', 'yearly', 'custom'].includes(period_type)) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Invalid period type',
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

    if (start_date > end_date) {
      return res.status(400).render('budget/create', {
        title: 'Create Budget',
        error: 'Start date cannot be later than end date',
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
      start_date,
      end_date,
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

    await budget.create({
      user_id,
      category_id,
      amount,
      period_type,
      start_date,
      end_date,
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
    const id = Number(req.params.id || 0);

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
      budget_item: item,
      categories: expense_categories
    });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = Number(req.params.id || 0);
    const category_id = Number(req.body.category_id || 0);
    const amount = Number(req.body.amount || 0);
    const period_type = req.body.period_type || '';
    const start_date = req.body.start_date || '';
    const end_date = req.body.end_date || '';
    const note = (req.body.note || '').trim();
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

    if (!category_id || !amount || !period_type || !start_date || !end_date) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Please fill all required fields',
        budget_item: old,
        categories: expense_categories
      });
    }

    if (!['weekly', 'monthly', 'yearly', 'custom'].includes(period_type)) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Invalid period type',
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

    if (start_date > end_date) {
      return res.status(400).render('budget/edit', {
        title: 'Edit Budget',
        error: 'Start date cannot be later than end date',
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
      start_date,
      end_date,
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

    await budget.update({
      id,
      user_id,
      category_id,
      amount,
      period_type,
      start_date,
      end_date,
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
    const id = Number(req.params.id || 0);

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