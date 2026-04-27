const transaction = require('../models/transaction');
const category = require('../models/category');
const account = require('../models/account');
const {
  parse_positive_int,
  parse_non_negative_int,
  is_valid_iso_date,
  is_valid_enum,
  normalize_optional_text,
  parse_enum
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

function parse_csv_row(line) {
  const out = [];
  let cur = '';
  let inq = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];

    if (c === '"') {
      if (inq && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }

      inq = !inq;
      continue;
    }

    if (!inq && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }

    cur += c;
  }

  out.push(cur.trim());
  return out;
}

function normalize_amount_cell(value) {
  const t = String(value || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}

function parse_date_cell(value) {
  const raw = String(value || '').trim();
  const iso = raw.slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && is_valid_iso_date(iso)) {
    return iso;
  }

  const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);

  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    const candidate = `${yyyy}-${mm}-${dd}`;

    if (is_valid_iso_date(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function load_import_view_data(user_id) {
  const [income_categories, expense_categories, accounts] = await Promise.all([
    category.get_active_by_type(user_id, 'income'),
    category.get_active_by_type(user_id, 'expense'),
    account.get_active_accounts(user_id)
  ]);

  return {
    filter_categories: [...income_categories, ...expense_categories],
    accounts
  };
}

async function show_import(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const ctx = await load_import_view_data(user_id);

    return res.render('transaction/import', {
      title: 'Import CSV',
      error: null,
      result: null,
      ...ctx
    });
  } catch (err) {
    return next(err);
  }
}

async function process_import(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const base_ctx = await load_import_view_data(user_id);

    if (!req.file || !req.file.buffer) {
      return res.status(400).render('transaction/import', {
        title: 'Import CSV',
        error: 'Please choose a CSV file',
        result: null,
        ...base_ctx
      });
    }

    const col_date = parse_non_negative_int(req.body.col_date, null);
    const col_amount = parse_non_negative_int(req.body.col_amount, null);
    const col_desc_raw = String(req.body.col_desc ?? '').trim();
    const col_type_raw = String(req.body.col_type ?? '').trim();
    const col_desc = col_desc_raw === '' ? -1 : parse_non_negative_int(col_desc_raw, null);
    const col_type = col_type_raw === '' ? -1 : parse_non_negative_int(col_type_raw, null);
    const has_header = String(req.body.has_header || '').trim() === '1';
    const default_type = parse_enum(req.body.default_transaction_type, ['income', 'expense'], 'expense');
    if (String(req.body.default_transaction_type || '').trim() === 'transfer') {
      return res.status(400).render('transaction/import', {
        title: 'Import CSV',
        error: 'Transfer type is not supported in CSV import (destination account column is required)',
        result: null,
        ...base_ctx
      });
    }

    const payment_method = parse_enum(req.body.payment_method, [
      'cash',
      'bank_transfer',
      'debit_card',
      'credit_card',
      'qris',
      'ewallet',
      'other'
    ], 'bank_transfer');

    const account_id = parse_positive_int(req.body.account_id, 0);
    const category_id = parse_positive_int(req.body.category_id, 0);

    if (col_date === null || col_amount === null || col_desc === null || col_type === null) {
      return res.status(400).render('transaction/import', {
        title: 'Import CSV',
        error: 'Invalid column index (use 0 for first column; leave optional columns blank)',
        result: null,
        ...base_ctx
      });
    }

    if (!account_id) {
      return res.status(400).render('transaction/import', {
        title: 'Import CSV',
        error: 'Please select a default account',
        result: null,
        ...base_ctx
      });
    }

    const acc = await account.find_by_id(account_id, user_id);

    if (!acc || Number(acc.is_active) !== 1) {
      return res.status(400).render('transaction/import', {
        title: 'Import CSV',
        error: 'Default account is invalid or inactive',
        result: null,
        ...base_ctx
      });
    }

    let cat = null;

    if (category_id) {
      cat = await category.find_by_id(category_id, user_id);

      if (!cat || Number(cat.is_active) !== 1) {
        return res.status(400).render('transaction/import', {
          title: 'Import CSV',
          error: 'Default category is invalid or inactive',
          result: null,
          ...base_ctx
        });
      }
    }

    const text = req.file.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length === 0) {
      return res.status(400).render('transaction/import', {
        title: 'Import CSV',
        error: 'CSV file is empty',
        result: null,
        ...base_ctx
      });
    }

    const start_index = has_header ? 1 : 0;
    let imported = 0;
    const failures = [];

    for (let i = start_index; i < lines.length; i += 1) {
      const row_num = i + 1;
      const cells = parse_csv_row(lines[i]);
      const max_col = Math.max(col_date, col_amount, col_desc >= 0 ? col_desc : -1, col_type >= 0 ? col_type : -1);

      if (cells.length <= max_col) {
        failures.push({ row: row_num, reason: 'Not enough columns' });
        continue;
      }

      const date_val = parse_date_cell(cells[col_date]);
      const amount_val = normalize_amount_cell(cells[col_amount]);

      if (!date_val) {
        failures.push({ row: row_num, reason: 'Invalid date' });
        continue;
      }

      if (!amount_val) {
        failures.push({ row: row_num, reason: 'Invalid amount' });
        continue;
      }

      let transaction_type = default_type;

      if (col_type >= 0 && cells[col_type]) {
        const cell_type = String(cells[col_type]).trim().toLowerCase();

        if (['income', 'expense'].includes(cell_type)) {
          transaction_type = cell_type;
        } else if (cell_type === 'transfer') {
          failures.push({ row: row_num, reason: 'Transfer type is not supported by CSV importer' });
          continue;
        }
      }

      if (!is_valid_enum(transaction_type, TRANSACTION_TYPES) || !is_valid_enum(payment_method, PAYMENT_METHODS)) {
        failures.push({ row: row_num, reason: 'Invalid type or payment method' });
        continue;
      }

      let row_category_id = category_id || null;
      let row_subcategory_id = null;

      if (cat && transaction_type !== 'transfer') {
        if (cat.category_type === 'income' && transaction_type !== 'income') {
          row_category_id = null;
        }

        if (cat.category_type === 'expense' && transaction_type !== 'expense') {
          row_category_id = null;
        }
      }

      if (transaction_type === 'transfer') {
        row_category_id = null;
        row_subcategory_id = null;
      }

      const description = col_desc >= 0 && cells[col_desc]
        ? normalize_optional_text(cells[col_desc], 500)
        : null;

      try {
        await transaction.create_with_balance_update({
          user_id,
          transaction_date: date_val,
          transaction_type,
          amount: amount_val,
          category_id: row_category_id,
          subcategory_id: row_subcategory_id,
          account_id,
          transfer_to_account_id: null,
          payment_method,
          description,
          reference_no: null
        });
        imported += 1;
      } catch (err) {
        failures.push({
          row: row_num,
          reason: err.message || 'Create failed'
        });
      }
    }

    return res.render('transaction/import', {
      title: 'Import CSV',
      error: null,
      result: {
        imported,
        failures
      },
      ...base_ctx
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  show_import,
  process_import
};
