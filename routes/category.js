const express = require('express');
const auth = require('../middleware/auth');
const category = require('../controllers/category');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

const router = express.Router();

router.get('/category', auth, allow_query_fields(['page', 'search', 'category_type', 'is_active']), category.index);
router.get('/category/create', auth, allow_query_fields([]), category.show_create);
router.post('/category', auth, allow_body_fields(['category_name', 'category_type', 'icon', 'color', 'is_active']), category.create);
router.get('/category/:id/edit', auth, allow_query_fields([]), category.show_edit);
router.put('/category/:id', auth, allow_body_fields(['category_name', 'category_type', 'icon', 'color', 'is_active']), category.update);
router.delete('/category/:id', auth, allow_body_fields([]), category.remove);

module.exports = router;