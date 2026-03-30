const express = require('express');
const auth = require('../middleware/auth');
const transaction = require('../controllers/transaction');

const router = express.Router();

router.get('/transaction', auth, transaction.index);
router.get('/transaction/create', auth, transaction.show_create);
router.get('/transaction/subcategories/:category_id', auth, transaction.get_subcategories);
router.get('/transaction/:id/edit', auth, transaction.show_edit);
router.post('/transaction', auth, transaction.create);
router.put('/transaction/:id', auth, transaction.update);
router.delete('/transaction/:id', auth, transaction.remove);

module.exports = router;