const category = require('../models/category');
const subcategory = require('../models/subcategory');

/**
 * Ensures category/subcategory belong to the user, are active, and match transaction type.
 * For transfer, category and subcategory must be absent.
 */
async function validate_category_subcategory_for_transaction(
  user_id,
  transaction_type,
  category_id,
  subcategory_id
) {
  if (transaction_type === 'transfer') {
    if (category_id || subcategory_id) {
      return { ok: false, error: 'Category and subcategory are not used for transfers' };
    }
    return { ok: true };
  }

  if (subcategory_id && !category_id) {
    return { ok: false, error: 'Select a category when using a subcategory' };
  }

  if (!category_id && !subcategory_id) {
    return { ok: true };
  }

  const cat = await category.find_by_id(category_id, user_id);
  if (!cat) {
    return { ok: false, error: 'Invalid category' };
  }
  if (Number(cat.is_active) !== 1) {
    return { ok: false, error: 'Category is inactive' };
  }
  if (cat.category_type !== transaction_type) {
    return { ok: false, error: 'Category does not match transaction type' };
  }

  if (subcategory_id) {
    const sub = await subcategory.find_by_id(subcategory_id, user_id);
    if (!sub) {
      return { ok: false, error: 'Invalid subcategory' };
    }
    if (Number(sub.is_active) !== 1) {
      return { ok: false, error: 'Subcategory is inactive' };
    }
    if (Number(sub.category_id) !== Number(category_id)) {
      return { ok: false, error: 'Subcategory does not match the selected category' };
    }
  }

  return { ok: true };
}

module.exports = {
  validate_category_subcategory_for_transaction
};
