const express = require('express');
const auth = require('../middleware/auth');
const budget = require('../controllers/budget');

const router = express.Router();

router.get('/budget', auth, budget.index);
router.get('/budget/create', auth, budget.show_create);
router.post('/budget', auth, budget.create);
router.get('/budget/:id/edit', auth, budget.show_edit);
router.put('/budget/:id', auth, budget.update);
router.delete('/budget/:id', auth, budget.remove);

module.exports = router;