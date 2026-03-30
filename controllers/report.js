const report = require('../models/report');

function get_month_range() {
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const from_date = firstDay.toISOString().slice(0, 10);
    const to_date = lastDay.toISOString().slice(0, 10);

    return {
        from_date,
        to_date
    };
}

async function index(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const { from_date, to_date } = get_month_range();

        const [
            summary,
            recent_transactions,
            top_categories,
            transaction_count,
            monthly_income_expense,
            expense_by_category
        ] = await Promise.all([
            report.get_dashboard_summary(user_id, from_date, to_date),
            report.get_recent_transactions(user_id, 5),
            report.get_top_expense_categories(user_id, from_date, to_date, 5),
            report.count_transactions_in_period(user_id, from_date, to_date),
            report.get_monthly_income_expense(user_id, 6),
            report.get_expense_by_category(user_id, from_date, to_date, 6)
        ]);
        console.log(monthly_income_expense)
        const total_income = Number(summary.total_income || 0);
        const total_expense = Number(summary.total_expense || 0);
        const total_transfer = Number(summary.total_transfer || 0);
        const balance = total_income - total_expense;

        return res.render('dashboard/index', {
            title: 'Dashboard',
            summary: {
                total_income,
                total_expense,
                total_transfer,
                balance,
                transaction_count
            },
            recent_transactions,
            top_categories,
            monthly_income_expense,
            expense_by_category,
            from_date,
            to_date
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    index
};