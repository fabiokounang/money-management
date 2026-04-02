const report = require('../models/report');
const {
    normalize_pagination_page,
    normalize_iso_date_range
} = require('../utils/validation');

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

function to_iso_date(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function get_current_week_range() {
    const now = new Date();
    const day = now.getDay(); // 0 Sun ... 6 Sat
    const distance_to_monday = day === 0 ? 6 : day - 1;

    const monday = new Date(now);
    monday.setDate(now.getDate() - distance_to_monday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
        from_date: to_iso_date(monday),
        to_date: to_iso_date(sunday)
    };
}

function get_previous_week_range(current_week_range) {
    const current_start = new Date(`${current_week_range.from_date}T00:00:00`);
    const prev_start = new Date(current_start);
    prev_start.setDate(current_start.getDate() - 7);

    const prev_end = new Date(prev_start);
    prev_end.setDate(prev_start.getDate() + 6);

    return {
        from_date: to_iso_date(prev_start),
        to_date: to_iso_date(prev_end)
    };
}

function build_weekly_recommendation(current_week, previous_week) {
    const current_income = Number(current_week.total_income || 0);
    const current_expense = Number(current_week.total_expense || 0);
    const previous_expense = Number(previous_week.total_expense || 0);
    const expense_delta = current_expense - previous_expense;
    const tx_count = Number(current_week.transaction_count || 0);

    if (tx_count === 0) {
        return {
            title: 'Start your weekly rhythm',
            message: 'Belum ada transaksi minggu ini. Coba catat minimal 1 pengeluaran hari ini supaya tracking tetap konsisten.',
            cta_label: 'Add first transaction',
            cta_href: '/transaction/create'
        };
    }

    if (expense_delta > 0) {
        return {
            title: 'Expense is trending up',
            message: `Pengeluaran minggu ini naik Rp ${expense_delta.toLocaleString('id-ID')} dibanding minggu lalu. Cek 3 transaksi teratas dan tentukan 1 batas belanja mingguan.`,
            cta_label: 'Review this week expenses',
            cta_href: `/transaction?from_date=${current_week.from_date}&to_date=${current_week.to_date}`
        };
    }

    if (current_income > current_expense) {
        return {
            title: 'Great weekly balance',
            message: 'Pemasukan minggu ini masih lebih besar dari pengeluaran. Pertahankan pola ini dan sisihkan ke tabungan/budget prioritas.',
            cta_label: 'View this week transactions',
            cta_href: `/transaction?from_date=${current_week.from_date}&to_date=${current_week.to_date}`
        };
    }

    return {
        title: 'Keep your weekly check-in',
        message: 'Cek ulang kategori belanja minggu ini dan tentukan 1 pengeluaran yang bisa dikurangi minggu depan.',
        cta_label: 'Open weekly transactions',
        cta_href: `/transaction?from_date=${current_week.from_date}&to_date=${current_week.to_date}`
    };
}

async function index(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const page = normalize_pagination_page(req.query.page);
        const limit = 10;
        const offset = (page - 1) * limit;

        const range = normalize_iso_date_range(
            req.query.from_date || '',
            req.query.to_date || '',
            get_default_month_range()
        );
        if (!range.ok) {
            req.flash('error_msg', range.message);
            return res.redirect('/dashboard');
        }

        const { from_date, to_date } = range;
        const current_week = get_current_week_range();
        const previous_week = get_previous_week_range(current_week);

        const [
            summary,
            recent_transactions,
            top_categories,
            transaction_count,
            trend_rows,
            expense_by_category,
						monthly_income_expense,
            current_week_summary,
            previous_week_summary
        ] = await Promise.all([
            report.get_dashboard_summary(user_id, from_date, to_date),
            report.get_recent_transactions_by_range(user_id, from_date, to_date, 5),
            report.get_top_expense_categories(user_id, from_date, to_date, 5),
            report.count_transactions_in_period(user_id, from_date, to_date),
            report.get_income_expense_trend_by_range(user_id, from_date, to_date),
            report.get_expense_by_category(user_id, from_date, to_date, 6),
						report.get_monthly_income_expense(user_id, 24),
            report.get_period_summary(user_id, current_week.from_date, current_week.to_date),
            report.get_period_summary(user_id, previous_week.from_date, previous_week.to_date)
        ]);

        const total_income = Number(summary.total_income || 0);
        const total_expense = Number(summary.total_expense || 0);
        const total_transfer = Number(summary.total_transfer || 0);
        const balance = total_income - total_expense;
        const weekly_checkin = {
            current_week: {
                ...current_week,
                total_income: Number(current_week_summary.total_income || 0),
                total_expense: Number(current_week_summary.total_expense || 0),
                transaction_count: Number(current_week_summary.transaction_count || 0)
            },
            previous_week: {
                ...previous_week,
                total_income: Number(previous_week_summary.total_income || 0),
                total_expense: Number(previous_week_summary.total_expense || 0),
                transaction_count: Number(previous_week_summary.transaction_count || 0)
            }
        };
        weekly_checkin.current_week.balance = weekly_checkin.current_week.total_income - weekly_checkin.current_week.total_expense;
        weekly_checkin.previous_week.balance = weekly_checkin.previous_week.total_income - weekly_checkin.previous_week.total_expense;
        weekly_checkin.expense_delta = weekly_checkin.current_week.total_expense - weekly_checkin.previous_week.total_expense;
        weekly_checkin.recommendation = build_weekly_recommendation(weekly_checkin.current_week, weekly_checkin.previous_week);

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
            weekly_checkin,
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