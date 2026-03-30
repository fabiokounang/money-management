const category = require('../models/category');

async function index(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const search = (req.query.search || '').trim();
    const category_type = req.query.category_type || '';
    const is_active = req.query.is_active === undefined || req.query.is_active === '' ?
      -1 :
      Number(req.query.is_active);

    const [categories, total] = await Promise.all([
      category.get_list(user_id, limit, offset, search, category_type, is_active),
      category.count_all(user_id, search, category_type, is_active)
    ]);

    const total_pages = Math.max(Math.ceil(total / limit), 1);

    return res.render('category/index', {
      title: 'Categories',
      categories,
      page,
      limit,
      total,
      total_pages,
      filters: {
        search,
        category_type,
        is_active
      }
    });
  } catch (error) {
    return next(error);
  }
}

function show_create(req, res) {
  return res.render('category/create', {
    title: 'Create Category',
    error: null,
    old: {}
  });
}

async function create(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const category_name = (req.body.category_name || '').trim();
    const category_type = req.body.category_type || '';
    const icon = (req.body.icon || '').trim();
    const color = (req.body.color || '').trim();
    const is_active = Number(req.body.is_active || 1);

    const old = {
      category_name,
      category_type,
      icon,
      color,
      is_active
    };

    if (!category_name || !category_type) {
      return res.status(400).render('category/create', {
        title: 'Create Category',
        error: 'Category name and type are required',
        old
      });
    }

    if (!['income', 'expense'].includes(category_type)) {
      return res.status(400).render('category/create', {
        title: 'Create Category',
        error: 'Invalid category type',
        old
      });
    }

    const existing = await category.find_by_name_and_type(
      user_id,
      category_name,
      category_type,
      0
    );

    if (existing) {
      return res.status(409).render('category/create', {
        title: 'Create Category',
        error: 'Category with the same name and type already exists',
        old
      });
    }

    await category.create({
      user_id,
      category_name,
      category_type,
      icon,
      color,
      is_active: is_active === 0 ? 0 : 1
    });

    req.flash('success_msg', 'Category created successfully');
    return res.redirect('/category');
  } catch (error) {
    return next(error);
  }
}

async function show_edit(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = Number(req.params.id || 0);

    const item = await category.find_by_id(id, user_id);

    if (!item) {
      req.flash('error_msg', 'Category not found');
      return res.redirect('/category');
    }

    return res.render('category/edit', {
      title: 'Edit Category',
      error: null,
      category_item: item
    });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const user_id = req.session.user.id;
    const id = Number(req.params.id || 0);
    const category_name = (req.body.category_name || '').trim();
    const category_type = req.body.category_type || '';
    const icon = (req.body.icon || '').trim();
    const color = (req.body.color || '').trim();
    const is_active = Number(req.body.is_active || 1);

    const old = {
      id,
      category_name,
      category_type,
      icon,
      color,
      is_active
    };

    if (!category_name || !category_type) {
      return res.status(400).render('category/edit', {
        title: 'Edit Category',
        error: 'Category name and type are required',
        category_item: old
      });
    }

    if (!['income', 'expense'].includes(category_type)) {
      return res.status(400).render('category/edit', {
        title: 'Edit Category',
        error: 'Invalid category type',
        category_item: old
      });
    }

    const item = await category.find_by_id(id, user_id);

    if (!item) {
      req.flash('error_msg', 'Category not found');
      return res.redirect('/category');
    }

    const existing = await category.find_by_name_and_type(
      user_id,
      category_name,
      category_type,
      id
    );

    if (existing) {
      return res.status(409).render('category/edit', {
        title: 'Edit Category',
        error: 'Category with the same name and type already exists',
        category_item: old
      });
    }

    await category.update({
      id,
      user_id,
      category_name,
      category_type,
      icon,
      color,
      is_active: is_active === 0 ? 0 : 1
    });

    req.flash('success_msg', 'Category updated successfully');
    return res.redirect('/category');
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const id = Number(req.params.id || 0);

        const item = await category.find_by_id(id, user_id);

        if (!item) {
            req.flash('error_msg', 'Category not found');
            return res.redirect('/category');
        }

        const transaction_count = await category.count_transactions_by_category(id, user_id);

        if (Number(transaction_count) > 0) {
            req.flash('error_msg', 'Category is still used by transactions. Please set it inactive instead.');
            return res.redirect('/category');
        }

        await category.remove(id, user_id);

        req.flash('success_msg', 'Category deleted successfully');
        return res.redirect('/category');
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