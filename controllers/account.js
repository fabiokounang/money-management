const account = require('../models/account');

async function index(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const page = Math.max(Number(req.query.page || 1), 1);
        const limit = 10;
        const offset = (page - 1) * limit;

        const search = (req.query.search || '').trim();
        const account_type = req.query.account_type || '';
        const is_active = req.query.is_active === undefined || req.query.is_active === ''
            ? -1
            : Number(req.query.is_active);

        const [accounts, total] = await Promise.all([
            account.get_list(user_id, limit, offset, search, account_type, is_active),
            account.count_all(user_id, search, account_type, is_active)
        ]);

        const total_pages = Math.max(Math.ceil(total / limit), 1);

        return res.render('account/index', {
            title: 'Accounts',
            accounts,
            page,
            limit,
            total,
            total_pages,
            filters: {
                search,
                account_type,
                is_active
            }
        });
    } catch (error) {
        return next(error);
    }
}

function show_create(req, res) {
    return res.render('account/create', {
        title: 'Create Account',
        error: null,
        old: {}
    });
}

async function create(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const account_name = (req.body.account_name || '').trim();
        const account_type = req.body.account_type || '';
        const opening_balance = Number(req.body.opening_balance || 0);
        const account_color = (req.body.account_color || '').trim();
        const note = (req.body.note || '').trim();
        const is_active = Number(req.body.is_active || 1);

        const old = {
            account_name,
            account_type,
            opening_balance,
            account_color,
            note,
            is_active
        };

        if (!account_name || !account_type) {
            return res.status(400).render('account/create', {
                title: 'Create Account',
                error: 'Account name and type are required',
                old
            });
        }

        if (!['cash', 'bank', 'ewallet', 'other'].includes(account_type)) {
            return res.status(400).render('account/create', {
                title: 'Create Account',
                error: 'Invalid account type',
                old
            });
        }

        if (opening_balance < 0) {
            return res.status(400).render('account/create', {
                title: 'Create Account',
                error: 'Opening balance cannot be negative',
                old
            });
        }

        const existing = await account.find_by_name(user_id, account_name, 0);

        if (existing) {
            return res.status(409).render('account/create', {
                title: 'Create Account',
                error: 'Account name already exists',
                old
            });
        }

        await account.create({
            user_id,
            account_name,
            account_type,
            opening_balance,
            current_balance: opening_balance,
            account_color,
            note,
            is_active: is_active === 0 ? 0 : 1
        });

        req.flash('success_msg', 'Account created successfully');
        return res.redirect('/account');
    } catch (error) {
        return next(error);
    }
}

async function show_edit(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = Number(req.params.id || 0);

        const item = await account.find_by_id(id, user_id);

        if (!item) {
            req.flash('error_msg', 'Account not found');
            return res.redirect('/account');
        }

        return res.render('account/edit', {
            title: 'Edit Account',
            error: null,
            account_item: item
        });
    } catch (error) {
        return next(error);
    }
}

async function update(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = Number(req.params.id || 0);
        const account_name = (req.body.account_name || '').trim();
        const account_type = req.body.account_type || '';
        const opening_balance = Number(req.body.opening_balance || 0);
        const account_color = (req.body.account_color || '').trim();
        const note = (req.body.note || '').trim();
        const is_active = Number(req.body.is_active || 1);

        const old = {
            id,
            account_name,
            account_type,
            opening_balance,
            account_color,
            note,
            is_active
        };

        if (!account_name || !account_type) {
            return res.status(400).render('account/edit', {
                title: 'Edit Account',
                error: 'Account name and type are required',
                account_item: old
            });
        }

        if (!['cash', 'bank', 'ewallet', 'other'].includes(account_type)) {
            return res.status(400).render('account/edit', {
                title: 'Edit Account',
                error: 'Invalid account type',
                account_item: old
            });
        }

        if (opening_balance < 0) {
            return res.status(400).render('account/edit', {
                title: 'Edit Account',
                error: 'Opening balance cannot be negative',
                account_item: old
            });
        }

        const item = await account.find_by_id(id, user_id);

        if (!item) {
            req.flash('error_msg', 'Account not found');
            return res.redirect('/account');
        }

        const existing = await account.find_by_name(user_id, account_name, id);

        if (existing) {
            return res.status(409).render('account/edit', {
                title: 'Edit Account',
                error: 'Account name already exists',
                account_item: old
            });
        }

        await account.update({
            id,
            user_id,
            account_name,
            account_type,
            opening_balance,
            account_color,
            note,
            is_active: is_active === 0 ? 0 : 1
        });

        req.flash('success_msg', 'Account updated successfully');
        return res.redirect('/account');
    } catch (error) {
        return next(error);
    }
}

async function remove(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = Number(req.params.id || 0);

        const item = await account.find_by_id(id, user_id);

        if (!item) {
            req.flash('error_msg', 'Account not found');
            return res.redirect('/account');
        }

        const transaction_count = await account.count_transactions_by_account(id, user_id);

        if (Number(transaction_count) > 0) {
            req.flash('error_msg', 'Account is still used by transactions. Please set it inactive instead.');
            return res.redirect('/account');
        }

        await account.remove(id, user_id);

        req.flash('success_msg', 'Account deleted successfully');
        return res.redirect('/account');
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