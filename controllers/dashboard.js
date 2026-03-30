const report = require('../models/report');

function get_default_month_range() {
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    return {
        from_date: first.toISOString().slice(0, 10),
        to_date: last.toISOString().slice(0, 10)
    };
}

function normalize_range(from, to) {
    const def = get_default_month_range();

    let from_date = from || def.from_date;
    let to_date = to || def.to_date;

    if (from_date > to_date) {
        const temp = from_date;
        from_date = to_date;
        to_date = temp;
    }

    return { from_date, to_date };
}

async function index(req, res, next) {
    try {
        const user_id = req.session.user.id;

        const { from_date, to_date } = normalize_range(
            req.query.from_date,
            req.query.to_date
        );

        const [
            summary,
            recent_transactions,
            top_categories,
            transaction_count,
            trend_rows,
            expense_by_category,
						monthly_income_expense
        ] = await Promise.all([
            report.get_dashboard_summary(user_id, from_date, to_date),
            report.get_recent_transactions_by_range(user_id, from_date, to_date, 5),
            report.get_top_expense_categories(user_id, from_date, to_date, 5),
            report.count_transactions_in_period(user_id, from_date, to_date),
            report.get_income_expense_trend_by_range(user_id, from_date, to_date),
            report.get_expense_by_category(user_id, from_date, to_date, 6),
						report.get_monthly_income_expense(user_id, 24)
        ]);

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
            trend_rows,
            expense_by_category,
						monthly_income_expense,
            filters: {
                from_date,
                to_date
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { index };