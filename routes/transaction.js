const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const transaction = require('../controllers/transaction');
const transaction_import = require('../controllers/transaction_import');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024
  }
});

router.get('/transaction', auth, transaction.index);
router.get('/transaction/import', auth, transaction_import.show_import);
router.post('/transaction/import', auth, upload.single('csv_file'), transaction_import.process_import);
router.get('/transaction/create', auth, transaction.show_create);
router.get('/transaction/subcategories/:category_id', auth, transaction.get_subcategories);
router.get('/transaction/:id/edit', auth, transaction.show_edit);
router.post('/transaction', auth, transaction.create);
router.put('/transaction/:id', auth, transaction.update);
router.delete('/transaction/:id', auth, transaction.remove);

module.exports = router;