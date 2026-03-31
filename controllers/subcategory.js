const subcategory = require('../models/subcategory');
const category = require('../models/category');
const {
    normalize_page,
    normalize_active_filter,
    parse_positive_int,
    normalize_text,
    is_allowed_date
} = require('../utils/validation');

async function index(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const page = normalize_page(req.query.page);
        const limit = 10;
        const offset = (page - 1) * limit;

        const search = normalize_text(req.query.search, 100);
        const category_id = parse_positive_int(req.query.category_id) || 0;
        const is_active = normalize_active_filter(req.query.is_active);

        const [subcategories, total, income_categories, expense_categories] = await Promise.all([
            subcategory.get_list(user_id, limit, offset, search, category_id, is_active),
            subcategory.count_all(user_id, search, category_id, is_active),
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense')
        ]);

        const total_pages = Math.max(Math.ceil(total / limit), 1);

        return res.render('subcategory/index', {
            title: 'Subcategories',
            subcategories,
            page,
            limit,
            total,
            total_pages,
            filters: {
                search,
                category_id,
                is_active
            },
            categories: [...income_categories, ...expense_categories]
        });
    } catch (error) {
        return next(error);
    }
}

async function show_create(req, res, next) {
    try {
        const user_id = req.session.user.id;

        const [income_categories, expense_categories] = await Promise.all([
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense')
        ]);

        return res.render('subcategory/create', {
            title: 'Create Subcategory',
            error: null,
            old: {},
            categories: [...income_categories, ...expense_categories]
        });
    } catch (error) {
        return next(error);
    }
}

async function create(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const category_id = parse_positive_int(req.body.category_id) || 0;
        const subcategory_name = normalize_text(req.body.subcategory_name, 100);
        const is_active = normalize_active_filter(req.body.is_active, 1);

        const [income_categories, expense_categories] = await Promise.all([
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense')
        ]);

        const categories = [...income_categories, ...expense_categories];

        const old = {
            category_id,
            subcategory_name,
            is_active
        };

        if (!category_id || !subcategory_name) {
            return res.status(400).render('subcategory/create', {
                title: 'Create Subcategory',
                error: 'Category and subcategory name are required',
                old,
                categories
            });
        }

        if (subcategory_name.length > 100) {
            return res.status(400).render('subcategory/create', {
                title: 'Create Subcategory',
                error: 'Subcategory name too long (max 100 characters)',
                old,
                categories
            });
        }

        const category_item = await category.find_by_id(category_id, user_id);

        if (!category_item) {
            return res.status(400).render('subcategory/create', {
                title: 'Create Subcategory',
                error: 'Selected category is not valid',
                old,
                categories
            });
        }

        const existing = await subcategory.find_by_name(
            user_id,
            category_id,
            subcategory_name,
            0
        );

        if (existing) {
            return res.status(409).render('subcategory/create', {
                title: 'Create Subcategory',
                error: 'Subcategory already exists in this category',
                old,
                categories
            });
        }

        await subcategory.create({
            category_id,
            subcategory_name,
            is_active: is_active === 0 ? 0 : 1
        });

        req.flash('success_msg', 'Subcategory created successfully');
        return res.redirect('/subcategory');
    } catch (error) {
        return next(error);
    }
}

async function show_edit(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = parse_positive_int(req.params.id);

        if (!id) {
            req.flash('error_msg', 'Invalid subcategory id');
            return res.redirect('/subcategory');
        }

        const [item, income_categories, expense_categories] = await Promise.all([
            subcategory.find_by_id(id, user_id),
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense')
        ]);

        if (!item) {
            req.flash('error_msg', 'Subcategory not found');
            return res.redirect('/subcategory');
        }

        return res.render('subcategory/edit', {
            title: 'Edit Subcategory',
            error: null,
            subcategory_item: item,
            categories: [...income_categories, ...expense_categories]
        });
    } catch (error) {
        return next(error);
    }
}

async function update(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = parse_positive_int(req.params.id);
        const category_id = parse_positive_int(req.body.category_id) || 0;
        const subcategory_name = normalize_text(req.body.subcategory_name, 100);
        const is_active = normalize_active_filter(req.body.is_active, 1);

        const [income_categories, expense_categories] = await Promise.all([
            category.get_active_by_type(user_id, 'income'),
            category.get_active_by_type(user_id, 'expense')
        ]);

        const categories = [...income_categories, ...expense_categories];

        const old = {
            id,
            category_id,
            subcategory_name,
            is_active
        };

        if (!id || !category_id || !subcategory_name) {
            return res.status(400).render('subcategory/edit', {
                title: 'Edit Subcategory',
                error: !id ? 'Invalid subcategory id' : 'Category and subcategory name are required',
                subcategory_item: old,
                categories
            });
        }

        if (subcategory_name.length > 100) {
            return res.status(400).render('subcategory/edit', {
                title: 'Edit Subcategory',
                error: 'Subcategory name too long (max 100 characters)',
                subcategory_item: old,
                categories
            });
        }

        const item = await subcategory.find_by_id(id, user_id);

        if (!item) {
            req.flash('error_msg', 'Subcategory not found');
            return res.redirect('/subcategory');
        }

        const category_item = await category.find_by_id(category_id, user_id);

        if (!category_item) {
            return res.status(400).render('subcategory/edit', {
                title: 'Edit Subcategory',
                error: 'Selected category is not valid',
                subcategory_item: old,
                categories
            });
        }

        const existing = await subcategory.find_by_name(
            user_id,
            category_id,
            subcategory_name,
            id
        );

        if (existing) {
            return res.status(409).render('subcategory/edit', {
                title: 'Edit Subcategory',
                error: 'Subcategory already exists in this category',
                subcategory_item: old,
                categories
            });
        }

        await subcategory.update({
            id,
            category_id,
            subcategory_name,
            is_active: is_active === 0 ? 0 : 1
        });

        req.flash('success_msg', 'Subcategory updated successfully');
        return res.redirect('/subcategory');
    } catch (error) {
        return next(error);
    }
}

async function remove(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = parse_positive_int(req.params.id);

        if (!id) {
            req.flash('error_msg', 'Invalid subcategory id');
            return res.redirect('/subcategory');
        }

        const item = await subcategory.find_by_id(id, user_id);

        if (!item) {
            req.flash('error_msg', 'Subcategory not found');
            return res.redirect('/subcategory');
        }

        const transaction_count = await subcategory.count_transactions_by_subcategory(id, user_id);

        if (Number(transaction_count) > 0) {
            req.flash('error_msg', 'Subcategory is still used by transactions. Please set it inactive instead.');
            return res.redirect('/subcategory');
        }

        await subcategory.remove(id, user_id);

        req.flash('success_msg', 'Subcategory deleted successfully');
        return res.redirect('/subcategory');
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