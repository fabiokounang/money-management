const express = require('express');
const auth = require('../middleware/auth');
const recurring = require('../controllers/recurring');

const router = express.Router();

/* Disabled — uncomment routes and `router.use('/', recurringRoutes)` in routes/web.js to enable.
router.get('/recurring', auth, recurring.index);
router.get('/recurring/create', auth, recurring.show_create);
router.post('/recurring', auth, recurring.create);
router.delete('/recurring/:id', auth, recurring.remove);
*/

module.exports = router;
