const express = require('express');
const auth = require('../middleware/auth');
const account = require('../controllers/account');

const router = express.Router();

router.get('/account', auth, account.index);
router.get('/account/create', auth, account.show_create);
router.post('/account', auth, account.create);
router.get('/account/:id/edit', auth, account.show_edit);
router.put('/account/:id', auth, account.update);
router.delete('/account/:id', auth, account.remove);

module.exports = router;