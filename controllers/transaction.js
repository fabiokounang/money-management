const transaction = require('../models/transaction');
const category = require('../models/category');
const account = require('../models/account');
const recurring_schedule = require('../models/recurring_schedule');
const displayTime = require('../utils/displayTime');
const { apply_due_recurring_for_user } = require('../utils/applyRecurring');
const {
    is_valid_iso_date,
    parse_positive_integer,
    normalize_pagination_page,
    normalize_optional_text,
    parse_non_negative_number,
    is_valid_enum,
    normalize_date_range,
    normalize_search,
    normalize_positive_int,
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

function default_month_range() {
    const now = new Date();
    const current_year = now.getFullYear();
    const current_month = now.getMonth();
    const month_start = new Date(current_year, current_month, 1);
    const month_end = new Date(current_year, current_month + 1, 0);

    function to_iso_date(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return {
        from_date: to_iso_date(month_start),
        to_date: to_iso_date(month_end)
    };
}

function build_transaction_filter_query(filters) {
    const qs = new URLSearchParams();
    if (filters.from_date) qs.set('from_date', filters.from_date);
    if (filters.to_date) qs.set('to_date', filters.to_date);
    if (filters.transaction_type) qs.set('transaction_type', filters.transaction_type);
    if (filters.account_id) qs.set('account_id', String(filters.account_id));
    if (filters.category_id) qs.set('category_id', String(filters.category_id));
    if (filters.search) qs.set('search', filters.search);
    return qs.toString();
}

async function index(req, res, next) {
	try {
		const user_id = req.session.user.id;
		await apply_due_recurring_for_user(user_id);

		const page = normalize_pagination_page(req.query.page);
		const limit = 10;
		const offset = (page - 1) * limit;

		const dr = normalize_date_range(req.query.from_date, req.query.to_date, default_month_range());
		if (!dr.ok) {
			req.flash('error_msg', dr.error);
			return res.redirect('/transaction');
		}

		const raw_type = String(req.query.transaction_type || '').trim();
		const transaction_type = parse_enum(raw_type, ['', 'income', 'expense', 'transfer'], '');
		if (raw_type !== '' && transaction_type === '') {
			req.flash('error_msg', 'Invalid transaction type filter');
			return res.redirect('/transaction');
		}

		const account_id_result = normalize_positive_int(req.query.account_id, {
			required: false,
			defaultValue: 0
		});
		if (!account_id_result.ok) {
			req.flash('error_msg', 'Invalid account filter');
			return res.redirect('/transaction');
		}

		const category_id_result = normalize_positive_int(req.query.category_id, {
			required: false,
			defaultValue: 0
		});
		if (!category_id_result.ok) {
			req.flash('error_msg', 'Invalid category filter');
			return res.redirect('/transaction');
		}

		const search = normalize_search(req.query.search, 100);

		const filters = {
			from_date: dr.from_date,
			to_date: dr.to_date,
			transaction_type,
			account_id: account_id_result.value,
			category_id: category_id_result.value,
			search
		};

		const [transactions, total, income_categories, expense_categories, accounts] = await Promise.all([
			transaction.get_list(user_id, limit, offset, filters),
			transaction.count_all(user_id, filters),
			category.get_active_by_type(user_id, 'income'),
			category.get_active_by_type(user_id, 'expense'),
			account.get_active_accounts(user_id)
		]);

		const total_pages = Math.max(Math.ceil(total / limit), 1);
		const filter_query = build_transaction_filter_query(filters);

		return res.render('transaction/index', {
			title: 'Transactions',
			transactions,
			page,
			limit,
			total,
			total_pages,
			filters,
			filter_query,
			filter_categories: [...income_categories, ...expense_categories],
			accounts
		});
	} catch (error) {
		return next(error);
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

		let prefill = null;
		const from_id = parse_positive_integer(req.query.from_id);

		if (from_id) {
			const src = await transaction.find_full_by_id(from_id, user_id);

			if (src) {
				prefill = {
					transaction_date: displayTime.toDateInputValue(src.transaction_date),
					transaction_type: src.transaction_type,
					amount: String(Number(src.amount || 0)),
					category_id: src.category_id ? Number(src.category_id) : null,
					subcategory_id: src.subcategory_id ? Number(src.subcategory_id) : null,
					account_id: src.account_id ? Number(src.account_id) : null,
					transfer_to_account_id: src.transfer_to_account_id ? Number(src.transfer_to_account_id) : null,
					payment_method: src.payment_method,
                    include_in_dashboard: Number(src.include_in_dashboard || 0) === 1 ? 1 : 0,
					description: src.description || '',
					reference_no: src.reference_no || ''
				};
			}
		}

		return res.render('transaction/create', {
			title: 'Create Transaction',
			error: null,
			income_categories,
			expense_categories,
			accounts,
			prefill
		});
	} catch (error) {
		return next(error);
	}
}

async function show_edit(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = parse_positive_integer(req.params.id);

        if (!id) {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        const [item, income_categories, expense_categories, accounts] = await Promise.all([
            transaction.find_full_by_id(id, user_id),
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense'),
            account.get_active_accounts(user_id)
        ]);

        if (!item) {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        let subcategories = [];

        if (item.category_id) {
            subcategories = await category.get_subcategories(item.category_id, user_id);
        }

        return res.render('transaction/edit', {
            title: 'Edit Transaction',
            error: null,
            transaction_item: item,
            income_categories,
            expense_categories,
            accounts,
            subcategories
        });
    } catch (error) {
        return next(error);
    }
}

async function create(req, res, next) {
	try {
		const user_id = req.session.user.id;
		const transaction_date = String(req.body.transaction_date || '').trim();
		const transaction_type = String(req.body.transaction_type || '').trim();
		const amount = parse_non_negative_number(req.body.amount);
		const category_id = parse_positive_integer(req.body.category_id);
		const subcategory_id = parse_positive_integer(req.body.subcategory_id);
		const account_id = parse_positive_integer(req.body.account_id);
		const transfer_to_account_id = parse_positive_integer(req.body.transfer_to_account_id);
		const payment_method = String(req.body.payment_method || '').trim();
        const include_in_dashboard = String(req.body.include_in_dashboard || '').trim() === '1' ? 1 : 0;
		const description = normalize_optional_text(req.body.description, 500);
		const reference_no = normalize_optional_text(req.body.reference_no, 100);

		if (!transaction_date || !transaction_type || !amount || !account_id || !payment_method) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Please fill all required fields',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (!is_valid_iso_date(transaction_date)) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid transaction date',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (!is_valid_enum(transaction_type, TRANSACTION_TYPES)) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid transaction type',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (!is_valid_enum(payment_method, PAYMENT_METHODS)) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid payment method',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (amount <= 0) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Amount must be greater than zero',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (!Number.isFinite(amount)) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid amount',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (req.body.category_id && !category_id) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid category',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (req.body.subcategory_id && !subcategory_id) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid subcategory',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (transaction_type === 'transfer' && req.body.transfer_to_account_id && !transfer_to_account_id) {
			const [income_categories, expense_categories, accounts] = await Promise.all([
				category.get_active_by_type(user_id, 'income'),
				category.get_active_by_type(user_id, 'expense'),
				account.get_active_accounts(user_id)
			]);

			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Invalid destination account',
				income_categories,
				expense_categories,
				accounts
			});
		}

		await transaction.create_with_balance_update({
			user_id,
			transaction_date,
			transaction_type,
			amount,
			category_id,
			subcategory_id,
			account_id,
			transfer_to_account_id,
			payment_method,
            include_in_dashboard,
			description,
			reference_no
		});

		if (String(req.body.enable_monthly_schedule || '').trim() === '1') {
			const schedule_next = String(req.body.schedule_next_due_date || '').trim();
			const interval_raw = parse_positive_integer(req.body.schedule_interval_months);
			const interval = interval_raw && interval_raw >= 1 && interval_raw <= 60 ? interval_raw : 1;

			if (is_valid_iso_date(schedule_next) && schedule_next > transaction_date) {
				const label_raw = normalize_optional_text(req.body.schedule_label, 200);
				const label = label_raw || (description ? String(description).slice(0, 200) : null);

				try {
					await recurring_schedule.create({
						user_id,
						label,
						interval_months: interval,
						next_due_date: schedule_next,
						is_active: 1,
						transaction_type,
						amount,
						account_id,
						transfer_to_account_id,
						category_id,
						subcategory_id,
						payment_method,
						description,
						reference_no
					});
					req.flash('success_msg', 'Transaction created and monthly schedule saved');
					return res.redirect('/transaction');
				} catch (schedule_err) {
					console.error('[recurring] create from transaction form', schedule_err.message || schedule_err);
					req.flash('success_msg', 'Transaction created (schedule could not be saved — check database migration)');
					return res.redirect('/transaction');
				}
			}
		}

		req.flash('success_msg', 'Transaction created successfully');
		return res.redirect('/transaction');
	} catch (error) {
		const user_id = req.session.user.id;
		const [income_categories, expense_categories, accounts] = await Promise.all([
			category.get_active_by_type(user_id, 'income'),
			category.get_active_by_type(user_id, 'expense'),
			account.get_active_accounts(user_id)
		]);

		if (error.message === 'SOURCE_ACCOUNT_INVALID') {
			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Source account not found or inactive',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (error.message === 'TRANSFER_DESTINATION_REQUIRED') {
			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Destination account is required for transfer',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (error.message === 'TRANSFER_ACCOUNT_SAME') {
			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Source and destination account cannot be the same',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (error.message === 'DESTINATION_ACCOUNT_INVALID') {
			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Destination account not found or inactive',
				income_categories,
				expense_categories,
				accounts
			});
		}

		if (error.message === 'INSUFFICIENT_BALANCE') {
			return res.status(400).render('transaction/create', {
				title: 'Create Transaction',
				error: 'Insufficient account balance',
				income_categories,
				expense_categories,
				accounts
			});
		}

		return next(error);
	}
}

async function update(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = parse_positive_integer(req.params.id);
        const transaction_date = String(req.body.transaction_date || '').trim();
        const transaction_type = String(req.body.transaction_type || '').trim();
        const amount = parse_non_negative_number(req.body.amount);
        const category_id = parse_positive_integer(req.body.category_id);
        const subcategory_id = parse_positive_integer(req.body.subcategory_id);
        const account_id = parse_positive_integer(req.body.account_id);
        const transfer_to_account_id = parse_positive_integer(req.body.transfer_to_account_id);
        const payment_method = String(req.body.payment_method || '').trim();
        const include_in_dashboard = String(req.body.include_in_dashboard || '').trim() === '1' ? 1 : 0;
        const description = normalize_optional_text(req.body.description, 500);
        const reference_no = normalize_optional_text(req.body.reference_no, 100);

        if (!id) {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        const oldItem = await transaction.find_full_by_id(id, user_id);

        if (!oldItem) {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        async function renderEditError(message) {
            const [income_categories, expense_categories, accounts] = await Promise.all([
                category.get_active_by_type(user_id, 'income'),
                category.get_active_by_type(user_id, 'expense'),
                account.get_active_accounts(user_id)
            ]);

            let subcategories = [];

            if (category_id) {
                subcategories = await category.get_subcategories(category_id, user_id);
            }

            return res.status(400).render('transaction/edit', {
                title: 'Edit Transaction',
                error: message,
                transaction_item: {
                    id,
                    transaction_date,
                    transaction_type,
                    amount,
                    category_id,
                    subcategory_id,
                    account_id,
                    transfer_to_account_id,
                    payment_method,
                    include_in_dashboard,
                    description,
                    reference_no
                },
                income_categories,
                expense_categories,
                accounts,
                subcategories
            });
        }

        if (!transaction_date || !transaction_type || !amount || !account_id || !payment_method) {
            return renderEditError('Please fill all required fields');
        }

        if (!is_valid_iso_date(transaction_date)) {
            return renderEditError('Invalid transaction date');
        }

        if (!is_valid_enum(transaction_type, TRANSACTION_TYPES)) {
            return renderEditError('Invalid transaction type');
        }

        if (!is_valid_enum(payment_method, PAYMENT_METHODS)) {
            return renderEditError('Invalid payment method');
        }

        if (!Number.isFinite(amount)) {
            return renderEditError('Invalid amount');
        }

        if (req.body.category_id && !category_id) {
            return renderEditError('Invalid category');
        }

        if (req.body.subcategory_id && !subcategory_id) {
            return renderEditError('Invalid subcategory');
        }

        if (transaction_type === 'transfer' && req.body.transfer_to_account_id && !transfer_to_account_id) {
            return renderEditError('Invalid destination account');
        }

        if (amount <= 0) {
            return renderEditError('Amount must be greater than zero');
        }

        await transaction.update_with_balance_update({
            id,
            user_id,
            transaction_date,
            transaction_type,
            amount,
            category_id,
            subcategory_id,
            account_id,
            transfer_to_account_id,
            payment_method,
            include_in_dashboard,
            description,
            reference_no
        });

        req.flash('success_msg', 'Transaction updated successfully');
        return res.redirect('/transaction');
    } catch (error) {
        const user_id = req.session.user.id;
        const id = parse_positive_integer(req.params.id);
        const transaction_date = String(req.body.transaction_date || '').trim();
        const transaction_type = String(req.body.transaction_type || '').trim();
        const amount = parse_non_negative_number(req.body.amount);
        const category_id = parse_positive_integer(req.body.category_id);
        const subcategory_id = parse_positive_integer(req.body.subcategory_id);
        const account_id = parse_positive_integer(req.body.account_id);
        const transfer_to_account_id = parse_positive_integer(req.body.transfer_to_account_id);
        const payment_method = String(req.body.payment_method || '').trim();
        const include_in_dashboard = String(req.body.include_in_dashboard || '').trim() === '1' ? 1 : 0;
        const description = normalize_optional_text(req.body.description, 500);
        const reference_no = normalize_optional_text(req.body.reference_no, 100);

        const [income_categories, expense_categories, accounts] = await Promise.all([
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense'),
            account.get_active_accounts(user_id)
        ]);

        let subcategories = [];

        if (category_id) {
            subcategories = await category.get_subcategories(category_id, user_id);
        }

        let message = 'Failed to update transaction';

        if (error.message === 'TRANSACTION_NOT_FOUND') {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        if (error.message === 'ACCOUNT_NOT_FOUND') {
            message = 'Related account not found';
        }

        if (error.message === 'SOURCE_ACCOUNT_INVALID') {
            message = 'Source account not found or inactive';
        }

        if (error.message === 'TRANSFER_DESTINATION_REQUIRED') {
            message = 'Destination account is required for transfer';
        }

        if (error.message === 'TRANSFER_ACCOUNT_SAME') {
            message = 'Source and destination account cannot be the same';
        }

        if (error.message === 'DESTINATION_ACCOUNT_INVALID') {
            message = 'Destination account not found or inactive';
        }

        if (error.message === 'INSUFFICIENT_BALANCE') {
            message = 'Insufficient account balance';
        }

        if (error.message === 'INVALID_TRANSACTION_TYPE') {
            message = 'Invalid transaction type';
        }

        if (error.message === 'INVALID_AMOUNT') {
            message = 'Amount must be greater than zero';
        }

        return res.status(400).render('transaction/edit', {
            title: 'Edit Transaction',
            error: message,
            transaction_item: {
                id,
                transaction_date,
                transaction_type,
                amount,
                category_id,
                subcategory_id,
                account_id,
                transfer_to_account_id,
                payment_method,
                include_in_dashboard,
                description,
                reference_no
            },
            income_categories,
            expense_categories,
            accounts,
            subcategories
        });
    }
}

async function remove(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = parse_positive_integer(req.params.id);

        if (!id) {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        await transaction.delete_with_balance_update(id, user_id);

        req.flash('success_msg', 'Transaction deleted successfully');
        return res.redirect('/transaction');
    } catch (error) {
        if (error.message === 'TRANSACTION_NOT_FOUND') {
            req.flash('error_msg', 'Transaction not found');
            return res.redirect('/transaction');
        }

        if (error.message === 'ACCOUNT_NOT_FOUND') {
            req.flash('error_msg', 'Related account not found');
            return res.redirect('/transaction');
        }

        if (error.message === 'INVALID_BALANCE_REVERSE') {
            req.flash('error_msg', 'Failed to delete transaction because account balance is inconsistent');
            return res.redirect('/transaction');
        }

        return next(error);
    }
}

async function get_subcategories(req, res, next) {
	try {
		const user_id = req.session.user.id;
		const category_id = parse_positive_integer(req.params.category_id);

		if (!category_id) {
			return res.status(400).json({
				success: false,
				message: 'Invalid category id',
				data: []
			});
		}

		const subcategories = await category.get_subcategories(category_id, user_id);

		return res.json({
			success: true,
			data: subcategories
		});
	} catch (error) {
		return next(error);
	}
}

module.exports = {
	index,
	show_create,
	show_edit,
	create,
	update,
	remove,
	get_subcategories
};