const express = require('express');
const auth = require('../middleware/auth');
const transaction = require('../controllers/transaction');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

/* CSV import — disabled. Uncomment below and Import CSV routes + sidebar link to enable.
const multer = require('multer');
const transaction_import = require('../controllers/transaction_import');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024
  }
});
*/

const router = express.Router();

router.get('/transaction', auth, allow_query_fields(['page', 'from_date', 'to_date', 'transaction_type', 'account_id', 'category_id', 'search']), transaction.index);
/* router.get('/transaction/import', auth, transaction_import.show_import);
router.post('/transaction/import', auth, upload.single('csv_file'), transaction_import.process_import); */
router.get('/transaction/create', auth, allow_query_fields(['from_id']), transaction.show_create);
router.get('/transaction/subcategories/:category_id', auth, allow_query_fields([]), transaction.get_subcategories);
router.get('/transaction/:id/edit', auth, allow_query_fields([]), transaction.show_edit);
router.post(
  '/transaction',
  auth,
  allow_body_fields([
    'transaction_date',
    'transaction_time',
    'transaction_type',
    'amount',
    'category_id',
    'subcategory_id',
    'account_id',
    'transfer_to_account_id',
    'payment_method',
    'include_in_dashboard',
    'description',
    'reference_no',
    'enable_monthly_schedule',
    'schedule_next_due_date',
    'schedule_interval_months',
    'schedule_label'
  ]),
  transaction.create
);
router.put(
  '/transaction/:id',
  auth,
  allow_body_fields([
    'transaction_date',
    'transaction_time',
    'transaction_type',
    'amount',
    'category_id',
    'subcategory_id',
    'account_id',
    'transfer_to_account_id',
    'payment_method',
    'include_in_dashboard',
    'description',
    'reference_no'
  ]),
  transaction.update
);
router.delete('/transaction/:id', auth, allow_body_fields([]), transaction.remove);

module.exports = router;