const express = require('express');
const auth = require('../middleware/auth');
const subcategory = require('../controllers/subcategory');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

const router = express.Router();

router.get('/subcategory', auth, allow_query_fields(['page', 'search', 'category_id', 'is_active']), subcategory.index);
router.get('/subcategory/create', auth, allow_query_fields([]), subcategory.show_create);
router.post('/subcategory', auth, allow_body_fields(['category_id', 'subcategory_name', 'is_active']), subcategory.create);
router.get('/subcategory/:id/edit', auth, allow_query_fields([]), subcategory.show_edit);
router.put('/subcategory/:id', auth, allow_body_fields(['category_id', 'subcategory_name', 'is_active']), subcategory.update);
router.delete('/subcategory/:id', auth, allow_body_fields([]), subcategory.remove);

module.exports = router;