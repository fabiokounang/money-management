const express = require('express');
const auth = require('../middleware/auth');
const category = require('../controllers/category');

const router = express.Router();

router.get('/category', auth, category.index);
router.get('/category/create', auth, category.show_create);
router.post('/category', auth, category.create);
router.get('/category/:id/edit', auth, category.show_edit);
router.put('/category/:id', auth, category.update);
router.delete('/category/:id', auth, category.remove);

module.exports = router;