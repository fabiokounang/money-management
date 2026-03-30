const transaction = require('../models/transaction');
const category = require('../models/category');
const account = require('../models/account');

async function index(req, res, next) {
	try {
		const user_id = req.session.user.id;
		const page = Math.max(Number(req.query.page || 1), 1);
		const limit = 10;
		const offset = (page - 1) * limit;

		const [transactions, total] = await Promise.all([
			transaction.get_list(user_id, limit, offset),
			transaction.count_all(user_id)
		]);

		const total_pages = Math.max(Math.ceil(total / limit), 1);

		return res.render('transaction/index', {
			title: 'Transactions',
			transactions,
			page,
			limit,
			total,
			total_pages
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

		return res.render('transaction/create', {
			title: 'Create Transaction',
			error: null,
			income_categories,
			expense_categories,
			accounts
		});
	} catch (error) {
		return next(error);
	}
}

async function show_edit(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = Number(req.params.id || 0);

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
		const transaction_date = req.body.transaction_date || '';
		const transaction_type = req.body.transaction_type || '';
		const amount = Number(req.body.amount || 0);
		const category_id = req.body.category_id ? Number(req.body.category_id) : null;
		const subcategory_id = req.body.subcategory_id ? Number(req.body.subcategory_id) : null;
		const account_id = req.body.account_id ? Number(req.body.account_id) : null;
		const transfer_to_account_id = req.body.transfer_to_account_id ? Number(req.body.transfer_to_account_id) : null;
		const payment_method = req.body.payment_method || '';
		const description = (req.body.description || '').trim();
		const reference_no = (req.body.reference_no || '').trim();

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

		if (!['income', 'expense', 'transfer'].includes(transaction_type)) {
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
			description,
			reference_no
		});

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
        const id = Number(req.params.id || 0);
        const transaction_date = req.body.transaction_date || '';
        const transaction_type = req.body.transaction_type || '';
        const amount = Number(req.body.amount || 0);
        const category_id = req.body.category_id ? Number(req.body.category_id) : null;
        const subcategory_id = req.body.subcategory_id ? Number(req.body.subcategory_id) : null;
        const account_id = req.body.account_id ? Number(req.body.account_id) : null;
        const transfer_to_account_id = req.body.transfer_to_account_id ? Number(req.body.transfer_to_account_id) : null;
        const payment_method = req.body.payment_method || '';
        const description = (req.body.description || '').trim();
        const reference_no = (req.body.reference_no || '').trim();

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

        if (!['income', 'expense', 'transfer'].includes(transaction_type)) {
            return renderEditError('Invalid transaction type');
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
            description,
            reference_no
        });

        req.flash('success_msg', 'Transaction updated successfully');
        return res.redirect('/transaction');
    } catch (error) {
        const user_id = req.session.user.id;
        const id = Number(req.params.id || 0);
        const transaction_date = req.body.transaction_date || '';
        const transaction_type = req.body.transaction_type || '';
        const amount = Number(req.body.amount || 0);
        const category_id = req.body.category_id ? Number(req.body.category_id) : null;
        const subcategory_id = req.body.subcategory_id ? Number(req.body.subcategory_id) : null;
        const account_id = req.body.account_id ? Number(req.body.account_id) : null;
        const transfer_to_account_id = req.body.transfer_to_account_id ? Number(req.body.transfer_to_account_id) : null;
        const payment_method = req.body.payment_method || '';
        const description = (req.body.description || '').trim();
        const reference_no = (req.body.reference_no || '').trim();

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
        const id = Number(req.params.id || 0);

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
		const category_id = Number(req.params.category_id || 0);

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