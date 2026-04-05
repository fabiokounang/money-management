const recurring_schedule = require('../models/recurring_schedule');
const category = require('../models/category');
const account = require('../models/account');
const {
  normalize_pagination_page,
  parse_positive_int,
  parse_positive_decimal,
  is_valid_iso_date,
  is_valid_enum,
  normalize_optional_text,
  normalize_string
} = require('../utils/validation');

const TRANSACTION_TYPES = new Set(['income', 'expense', 'transfer']);
const PAYMENT_METHODS = new Set([
  'cash',
  'bank_transfer',
  'debit_card',
  'credit_card',
  'qris',
  'ewallet',
  'other'
]);

async function index(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const page = normalize_pagination_page(req.query.page);
    const limit = 20;
    const offset = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      recurring_schedule.get_list(user_id, limit, offset),
      recurring_schedule.count_all(user_id)
    ]);

    const total_pages = Math.max(Math.ceil(total / limit), 1);

    return res.render('recurring/index', {
      title: 'Scheduled transactions',
      schedules: rows,
      page,
      limit,
      total,
      total_pages
    });
  } catch (err) {
    return next(err);
  }
}

async function show_create(req, res, next) {
  try {
    const user_id = req.session.user.id;

    const [income_categories, expense_categories, accounts] = await Promise.all([
      category.get_active_by_type(user_id, 'income'),
      category.get_active_by_type(user_id, 'expense'),
      account.get_active_accounts(user_id)
    ]);

    return res.render('recurring/create', {
      title: 'New schedule',
      error: null,
      income_categories,
      expense_categories,
      accounts,
      old: {}
    });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const label = normalize_optional_text(req.body.label, 200);
    const next_due_date = normalize_string(req.body.next_due_date, 10);
    const interval_months = parse_positive_int(req.body.interval_months) || 1;
    const transaction_type = String(req.body.transaction_type || '').trim();
    const amount = parse_positive_decimal(req.body.amount);
    const category_id = parse_positive_int(req.body.category_id, 0);
    const subcategory_id = parse_positive_int(req.body.subcategory_id, 0);
    const account_id = parse_positive_int(req.body.account_id, 0);
    const transfer_to_account_id = parse_positive_int(req.body.transfer_to_account_id, 0);
    const payment_method = String(req.body.payment_method || '').trim();
    const description = normalize_optional_text(req.body.description, 500);
    const reference_no = normalize_optional_text(req.body.reference_no, 100);

    const [income_categories, expense_categories, accounts] = await Promise.all([
      category.get_active_by_type(user_id, 'income'),
      category.get_active_by_type(user_id, 'expense'),
      account.get_active_accounts(user_id)
    ]);

    const old = {
      label: label || '',
      next_due_date,
      interval_months,
      transaction_type,
      amount,
      category_id,
      subcategory_id,
      account_id,
      transfer_to_account_id,
      payment_method,
      description: description || '',
      reference_no: reference_no || ''
    };

    async function renderErr(msg) {
      return res.status(400).render('recurring/create', {
        title: 'New schedule',
        error: msg,
        income_categories,
        expense_categories,
        accounts,
        old
      });
    }

    if (!next_due_date || !transaction_type || !amount || !account_id || !payment_method) {
      return renderErr('Please fill all required fields');
    }

    if (!is_valid_iso_date(next_due_date)) {
      return renderErr('Invalid next due date');
    }

    if (!is_valid_enum(transaction_type, TRANSACTION_TYPES)) {
      return renderErr('Invalid transaction type');
    }

    if (!is_valid_enum(payment_method, PAYMENT_METHODS)) {
      return renderErr('Invalid payment method');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return renderErr('Amount must be greater than zero');
    }

    if (interval_months < 1 || interval_months > 60) {
      return renderErr('Interval must be between 1 and 60 months');
    }

    if (transaction_type === 'transfer') {
      if (!transfer_to_account_id) {
        return renderErr('Destination account is required for transfer');
      }

      if (transfer_to_account_id === account_id) {
        return renderErr('Source and destination cannot be the same');
      }
    }

    await recurring_schedule.create({
      user_id,
      label,
      interval_months,
      next_due_date,
      is_active: 1,
      transaction_type,
      amount,
      account_id,
      transfer_to_account_id: transaction_type === 'transfer' ? transfer_to_account_id : null,
      category_id: transaction_type === 'transfer' ? null : (category_id || null),
      subcategory_id: transaction_type === 'transfer' ? null : (subcategory_id || null),
      payment_method,
      description,
      reference_no
    });

    req.flash('success_msg', 'Schedule saved. It will post automatically on or after the due date when you open the app.');
    return res.redirect('/recurring');
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = parse_positive_int(req.params.id, 0);

    if (!id) {
      req.flash('error_msg', 'Schedule not found');
      return res.redirect('/recurring');
    }

    await recurring_schedule.remove(id, user_id);
    req.flash('success_msg', 'Schedule removed');
    return res.redirect('/recurring');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  index,
  show_create,
  create,
  remove
};
