const express = require('express');
const auth = require('../middleware/auth');
const account = require('../controllers/account');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

const router = express.Router();

router.get('/account', auth, allow_query_fields(['page', 'search', 'account_type', 'is_active']), account.index);
router.get('/account/create', auth, allow_query_fields([]), account.show_create);
router.post('/account', auth, allow_body_fields(['account_name', 'account_type', 'opening_balance', 'account_color', 'note', 'is_active']), account.create);
router.get('/account/:id/edit', auth, allow_query_fields([]), account.show_edit);
router.put('/account/:id', auth, allow_body_fields(['account_name', 'account_type', 'opening_balance', 'account_color', 'note', 'is_active']), account.update);
router.delete('/account/:id', auth, allow_body_fields([]), account.remove);

module.exports = router;