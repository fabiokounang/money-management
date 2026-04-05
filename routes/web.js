const express = require('express');

const authRoutes = require('./auth');
const transactionRoutes = require('./transaction');
const dashboardRoutes = require('./dashboard');
const reportRoutes = require('./report');
const categoryRoutes = require('./category');
const subCategoryRoutes = require('./subcategory');
const accountRoutes = require('./account');
const budgetRoutes = require('./budget');
const exportRoutes = require('./export');
const recurringRoutes = require('./recurring');

const router = express.Router();

router.use('/', authRoutes);
router.use('/', dashboardRoutes);
router.use('/', categoryRoutes);
router.use('/', subCategoryRoutes);
router.use('/', transactionRoutes);
router.use('/', recurringRoutes);
router.use('/', reportRoutes);
router.use('/', accountRoutes);
router.use('/', budgetRoutes);
router.use('/', exportRoutes);

router.get('/', (req, res) => {
	if (req.session.user) return res.redirect('/dashboard');
	return res.redirect('/login');
});

module.exports = router;