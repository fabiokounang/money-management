const loan = require('../models/loan');
const account = require('../models/account');
const transaction = require('../models/transaction');
const {
  normalize_page,
  normalize_string,
  normalize_enum,
  parse_non_negative_decimal,
  parse_positive_int,
  is_valid_iso_date,
  parse_positive_integer,
  parse_enum
} = require('../utils/validation');

const LOAN_TYPES = new Set(['receivable', 'payable']);
const LOAN_STATUSES = new Set(['open', 'settled', 'overdue']);

function normalize_time_input(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(raw)) return `${raw}:00`;
  if (/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(raw)) return raw;
  return '';
}

async function index(req, res, next) {
  try {
    const user_id = req.session.user.id;
    await loan.touch_overdue_statuses(user_id);

    const page = normalize_page(req.query.page);
    const limit = 10;
    const offset = (page - 1) * limit;

    const filters = {
      search: normalize_string(req.query.search, 120),
      loan_type: normalize_enum(req.query.loan_type, LOAN_TYPES),
      status: normalize_enum(req.query.status, LOAN_STATUSES)
    };

    const [rows, total, summary] = await Promise.all([
      loan.get_list(user_id, limit, offset, filters),
      loan.count_all(user_id, filters),
      loan.get_summary(user_id)
    ]);

    const total_pages = Math.max(Math.ceil(Number(total || 0) / limit), 1);
    return res.render('loan/index', {
      title: 'Loans',
      loans: rows,
      summary,
      filters,
      page,
      limit,
      total,
      total_pages
    });
  } catch (err) {
    return next(err);
  }
}

function show_create(req, res) {
  return res.render('loan/create', {
    title: 'Create Loan',
    error: null,
    old: {}
  });
}

async function create(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const loan_type = normalize_enum(req.body.loan_type, LOAN_TYPES);
    const counterparty_name = normalize_string(req.body.counterparty_name, 120);
    const principal_amount = parse_non_negative_decimal(req.body.principal_amount);
    const start_date = normalize_string(req.body.start_date, 10);
    const due_date = normalize_string(req.body.due_date, 10);
    const reminder_days = parse_positive_int(req.body.reminder_days, 0) || 0;
    const note = normalize_string(req.body.note, 500);

    const old = { loan_type, counterparty_name, principal_amount, start_date, due_date, reminder_days, note };

    if (!loan_type || !counterparty_name || !principal_amount || !start_date) {
      return res.status(400).render('loan/create', { title: 'Create Loan', error: 'Please fill all required fields', old });
    }
    if (!is_valid_iso_date(start_date)) {
      return res.status(400).render('loan/create', { title: 'Create Loan', error: 'Invalid start date', old });
    }
    if (due_date && !is_valid_iso_date(due_date)) {
      return res.status(400).render('loan/create', { title: 'Create Loan', error: 'Invalid due date', old });
    }
    if (Number(principal_amount) <= 0) {
      return res.status(400).render('loan/create', { title: 'Create Loan', error: 'Principal amount must be greater than zero', old });
    }

    let status = 'open';
    if (due_date && new Date(due_date) < new Date() && Number(principal_amount) > 0) {
      status = 'overdue';
    }

    await loan.create({
      user_id,
      loan_type,
      counterparty_name,
      principal_amount: Number(principal_amount),
      outstanding_amount: Number(principal_amount),
      start_date,
      due_date: due_date || null,
      status,
      reminder_days,
      note: note || null
    });

    req.flash('success_msg', 'Loan entry created');
    return res.redirect('/loan');
  } catch (err) {
    return next(err);
  }
}

async function show_detail(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = parse_positive_int(req.params.id, 0);
    if (!id) {
      req.flash('error_msg', 'Loan entry not found');
      return res.redirect('/loan');
    }

    await loan.touch_overdue_statuses(user_id);
    const item = await loan.find_by_id(id, user_id);
    if (!item) {
      req.flash('error_msg', 'Loan entry not found');
      return res.redirect('/loan');
    }

    const [payments, accounts] = await Promise.all([
      loan.get_payments(id, user_id),
      account.get_active_accounts(user_id)
    ]);
    return res.render('loan/detail', {
      title: 'Loan Detail',
      item,
      payments,
      accounts,
      error: null
    });
  } catch (err) {
    return next(err);
  }
}

async function add_payment(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const loan_id = parse_positive_int(req.params.id, 0);
    const amount = parse_non_negative_decimal(req.body.amount);
    const payment_date = normalize_string(req.body.payment_date, 10);
    const payment_time = normalize_time_input(req.body.payment_time);
    const note = normalize_string(req.body.note, 300);
    const create_transaction = String(req.body.create_transaction || '').trim() === '1';
    const account_id = parse_positive_integer(req.body.account_id);
    const payment_method = parse_enum(
      req.body.payment_method,
      ['cash', 'bank_transfer', 'debit_card', 'credit_card', 'qris', 'ewallet', 'other'],
      'bank_transfer'
    );
    const include_in_dashboard = String(req.body.include_in_dashboard || '').trim() === '1' ? 1 : 0;

    if (!loan_id) {
      req.flash('error_msg', 'Loan entry not found');
      return res.redirect('/loan');
    }
    if (!amount || Number(amount) <= 0) {
      req.flash('error_msg', 'Payment amount must be greater than zero');
      return res.redirect(`/loan/${loan_id}`);
    }
    if (!payment_date || !is_valid_iso_date(payment_date)) {
      req.flash('error_msg', 'Invalid payment date');
      return res.redirect(`/loan/${loan_id}`);
    }
    if (!payment_time) {
      req.flash('error_msg', 'Invalid payment time');
      return res.redirect(`/loan/${loan_id}`);
    }

    const item = await loan.find_by_id(loan_id, user_id);
    if (!item) {
      req.flash('error_msg', 'Loan entry not found');
      return res.redirect('/loan');
    }

    if (create_transaction && !account_id) {
      req.flash('error_msg', 'Please choose destination account for auto transaction');
      return res.redirect(`/loan/${loan_id}`);
    }

    await loan.add_payment({
      loan_id,
      user_id,
      amount: Number(amount),
      payment_date,
      payment_time,
      note: note || null
    });

    if (create_transaction) {
      const tx_type = item.loan_type === 'receivable' ? 'income' : 'expense';
      const tx_desc_prefix = item.loan_type === 'receivable' ? 'Loan payment received' : 'Loan payment paid';
      await transaction.create_with_balance_update({
        user_id,
        transaction_date: payment_date,
        transaction_time: payment_time,
        transaction_type: tx_type,
        amount: Number(amount),
        category_id: null,
        subcategory_id: null,
        account_id,
        transfer_to_account_id: null,
        payment_method,
        include_in_dashboard,
        description: `${tx_desc_prefix} - ${item.counterparty_name} (loan #${loan_id})`,
        reference_no: null
      });
    }

    req.flash('success_msg', create_transaction ? 'Payment recorded + transaction created' : 'Payment recorded');
    return res.redirect(`/loan/${loan_id}`);
  } catch (err) {
    if (err.message === 'PAYMENT_EXCEEDS_OUTSTANDING') {
      req.flash('error_msg', 'Payment exceeds outstanding amount');
      return res.redirect(`/loan/${req.params.id}`);
    }
    if (err.message === 'LOAN_NOT_FOUND') {
      req.flash('error_msg', 'Loan entry not found');
      return res.redirect('/loan');
    }
    return next(err);
  }
}

module.exports = {
  index,
  show_create,
  create,
  show_detail,
  add_payment
};
