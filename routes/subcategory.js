const express = require('express');
const auth = require('../middleware/auth');
const subcategory = require('../controllers/subcategory');

const router = express.Router();

router.get('/subcategory', auth, subcategory.index);
router.get('/subcategory/create', auth, subcategory.show_create);
router.post('/subcategory', auth, subcategory.create);
router.get('/subcategory/:id/edit', auth, subcategory.show_edit);
router.put('/subcategory/:id', auth, subcategory.update);
router.delete('/subcategory/:id', auth, subcategory.remove);

module.exports = router;