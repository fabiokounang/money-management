const report = require('../models/report');
const budget = require('../models/budget');
const monthly_income_plan = require('../models/monthly_income_plan');
const { apply_due_recurring_for_user } = require('../utils/applyRecurring');
const {
    normalize_pagination_page,
    normalize_date_range,
    sanitize_enum,
    is_valid_iso_date,
    parse_non_negative_decimal
} = require('../utils/validation');

function get_default_month_range() {
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    return {
        from_date: to_iso_date(first),
        to_date: to_iso_date(last)
    };
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

function plan_month_key_from_range_start(from_date) {
    if (!from_date || typeof from_date !== 'string' || from_date.length < 7) {
        return '';
    }

    return `${from_date.slice(0, 7)}-01`;
}

function format_plan_month_label(plan_month) {
    const parts = String(plan_month || '').split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    if (!y || !m) {
        return plan_month || '';
    }

    const d = new Date(y, m - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function normalize_plan_month_input(value) {
    const s = String(value || '').trim();
    if (!is_valid_iso_date(s) || !s.endsWith('-01')) {
        return null;
    }

    return s;
}

function build_plan_vs_actual({
    from_date,
    to_date,
    planned_income,
    planned_expense_total,
    actual_income,
    actual_expense
}) {
    const plan_month = plan_month_key_from_range_start(from_date);
    const range_spans_multiple_months = Boolean(
        from_date && to_date && from_date.slice(0, 7) !== to_date.slice(0, 7)
    );

    const pi = Number(planned_income || 0);
    const pe = Number(planned_expense_total || 0);
    const ai = Number(actual_income || 0);
    const ae = Number(actual_expense || 0);

    const net_planned = pi - pe;
    const net_actual = ai - ae;

    return {
        plan_month,
        plan_month_label: format_plan_month_label(plan_month),
        range_spans_multiple_months,
        planned_income: pi,
        planned_expense_total: pe,
        actual_income: ai,
        actual_expense: ae,
        net_planned: net_planned,
        net_actual: net_actual,
        variance_income: ai - pi,
        variance_expense: ae - pe,
        variance_net: net_actual - net_planned,
        expense_pct_of_planned: pe > 0 ? Math.min(999, Math.round((ae / pe) * 1000) / 10) : null
    };
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
            message: 'No transactions yet this week. Log at least one expense today to keep tracking consistent.',
            cta_label: 'Add first transaction',
            cta_href: '/transaction/create'
        };
    }

    if (expense_delta > 0) {
        return {
            title: 'Expense is trending up',
            message: `This week’s spending is up Rp ${expense_delta.toLocaleString('id-ID')} vs last week. Review your top few transactions and set one weekly spending cap.`,
            cta_label: 'Review this week expenses',
            cta_href: `/transaction?from_date=${current_week.from_date}&to_date=${current_week.to_date}`
        };
    }

    if (current_income > current_expense) {
        return {
            title: 'Great weekly balance',
            message: 'Income is still higher than spending this week. Keep it up and move any surplus to savings or priority budgets.',
            cta_label: 'View this week transactions',
            cta_href: `/transaction?from_date=${current_week.from_date}&to_date=${current_week.to_date}`
        };
    }

    return {
        title: 'Keep your weekly check-in',
        message: 'Review this week’s spending categories and pick one expense to trim next week.',
        cta_label: 'Open weekly transactions',
        cta_href: `/transaction?from_date=${current_week.from_date}&to_date=${current_week.to_date}`
    };
}

function build_actionable_insights({
    from_date,
    to_date,
    total_income,
    total_expense,
    balance,
    top_categories,
    monthly_income_expense
}) {
    const safe_top_categories = Array.isArray(top_categories) ? top_categories : [];
    const safe_monthly = Array.isArray(monthly_income_expense) ? monthly_income_expense : [];
    const insights = [];

    const income_value = Number(total_income || 0);
    const expense_value = Number(total_expense || 0);
    const balance_value = Number(balance || 0);
    const saving_rate = income_value > 0 ? (balance_value / income_value) * 100 : 0;

    if (income_value <= 0 && expense_value <= 0) {
        insights.push({
            title: 'Start with one daily input',
            message: 'No data in this period yet. Try logging at least one transaction per day for a week to build useful insights.',
            tone: 'neutral',
            cta_label: 'Add transaction',
            cta_href: '/transaction/create'
        });
    } else if (saving_rate >= 20) {
        insights.push({
            title: 'Healthy saving momentum',
            message: `Your saving rate is about ${saving_rate.toFixed(1)}% for ${from_date} to ${to_date}. Keep the rhythm and move surplus to priority savings.`,
            tone: 'positive',
            cta_label: 'Review this period',
            cta_href: `/transaction?from_date=${from_date}&to_date=${to_date}`
        });
    } else if (balance_value < 0) {
        insights.push({
            title: 'Expense is above income',
            message: `Period balance is negative by Rp ${Math.abs(balance_value).toLocaleString('id-ID')}. Focus on your 1–2 largest spending categories this week.`,
            tone: 'warning',
            cta_label: 'Check transactions',
            cta_href: `/transaction?from_date=${from_date}&to_date=${to_date}`
        });
    } else {
        insights.push({
            title: 'Room to improve savings',
            message: `Your saving rate is ${saving_rate.toFixed(1)}%. Try moving toward 20% with weekly caps on your most-used categories.`,
            tone: 'neutral',
            cta_label: 'Open budgets',
            cta_href: '/budget'
        });
    }

    if (safe_top_categories.length > 0) {
        const top = safe_top_categories[0];
        const top_total = Number(top.total || 0);
        insights.push({
            title: 'Top expense focus',
            message: `Your top spending category is ${top.category_name} (Rp ${top_total.toLocaleString('id-ID')}). Set a dedicated limit there to feel the impact quickly.`,
            tone: 'warning',
            cta_label: 'Review category spend',
            cta_href: `/transaction?from_date=${from_date}&to_date=${to_date}`
        });
    }

    if (safe_monthly.length >= 2) {
        const last_index = safe_monthly.length - 1;
        const current_month = safe_monthly[last_index];
        const previous_month = safe_monthly[last_index - 1];
        const current_expense = Number(current_month.total_expense || 0);
        const previous_expense = Number(previous_month.total_expense || 0);
        const diff = current_expense - previous_expense;

        if (diff > 0) {
            insights.push({
                title: 'Monthly expense is trending up',
                message: `This month’s spending is up Rp ${diff.toLocaleString('id-ID')} vs last month. Review recurring transactions for cuts.`,
                tone: 'warning',
                cta_label: 'Inspect monthly trend',
                cta_href: '/report'
            });
        } else if (diff < 0) {
            insights.push({
                title: 'Monthly expense is improving',
                message: `This month’s spending is down Rp ${Math.abs(diff).toLocaleString('id-ID')} from last month. Keep the improved pattern.`,
                tone: 'positive',
                cta_label: 'See full report',
                cta_href: '/report'
            });
        }
    }

    return insights.slice(0, 3);
}

async function index(req, res, next) {
    try {
        const user_id = req.session.user.id;
        await apply_due_recurring_for_user(user_id);

        const page = normalize_pagination_page(req.query.page);
        const limit = 10;
        const offset = (page - 1) * limit;

        const range = normalize_date_range(
            req.query.from_date,
            req.query.to_date,
            get_default_month_range()
        );
        if (!range.ok) {
            req.flash('error_msg', range.error);
            return res.redirect('/dashboard');
        }

        const { from_date, to_date } = range;
        const trend_granularity = sanitize_enum(req.query.trend_granularity, ['day', 'month', 'year'], 'month');
        const current_week = get_current_week_range();
        const previous_week = get_previous_week_range(current_week);

        const plan_month = plan_month_key_from_range_start(from_date);

        const [
            summary,
            recent_transactions,
            top_categories,
            transaction_counts,
            income_expense_trend,
            expense_by_category,
            monthly_income_expense,
            current_week_summary,
            previous_week_summary,
            budget_alerts,
            planned_expense_total,
            stored_planned_income
        ] = await Promise.all([
            report.get_dashboard_summary(user_id, from_date, to_date),
            report.get_recent_transactions_by_range(user_id, from_date, to_date, 5),
            report.get_top_expense_categories(user_id, from_date, to_date, 5),
            report.count_transactions_by_dashboard_flag(user_id, from_date, to_date),
            report.get_income_expense_trend(user_id, from_date, to_date, trend_granularity, '', 0),
            report.get_expense_by_category(user_id, from_date, to_date, 6),
            report.get_monthly_income_expense(user_id, 24),
            report.get_period_summary(user_id, current_week.from_date, current_week.to_date),
            report.get_period_summary(user_id, previous_week.from_date, previous_week.to_date),
            budget.get_active_period_alert_counts(user_id),
            budget.sum_planned_expense_budgets_overlap(user_id, from_date, to_date),
            plan_month ? monthly_income_plan.get_planned_income(user_id, plan_month) : Promise.resolve(0)
        ]);

        const total_income = Number(summary.total_income || 0);
        const total_expense = Number(summary.total_expense || 0);
        const total_transfer = Number(summary.total_transfer || 0);
        const balance = total_income - total_expense;

        const plan_vs_actual = build_plan_vs_actual({
            from_date,
            to_date,
            planned_income: stored_planned_income,
            planned_expense_total,
            actual_income: total_income,
            actual_expense: total_expense
        });
        const actionable_insights = build_actionable_insights({
            from_date,
            to_date,
            total_income,
            total_expense,
            balance,
            top_categories,
            monthly_income_expense
        });
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
                transaction_count: Number(transaction_counts.total || 0),
                transaction_included_count: Number(transaction_counts.included_count || 0),
                transaction_excluded_count: Number(transaction_counts.excluded_count || 0)
            },
            recent_transactions,
            top_categories,
            income_expense_trend,
            expense_by_category,
            trend_granularity,
            actionable_insights,
            weekly_checkin,
            budget_alerts,
            plan_vs_actual,
            filters: {
                from_date,
                to_date,
                trend_granularity
            }
        });
    } catch (err) {
        next(err);
    }
}

async function save_planned_income(req, res, next) {
    try {
        const user_id = req.session.user.id;
        const plan_month = normalize_plan_month_input(req.body.plan_month);
        const parsed_income = parse_non_negative_decimal(req.body.planned_income);
        const redirect_from = String(req.body.redirect_from_date || '').trim();
        const redirect_to = String(req.body.redirect_to_date || '').trim();
        const trend_granularity = sanitize_enum(
            req.body.redirect_trend_granularity,
            ['day', 'month', 'year'],
            'month'
        );

        if (!plan_month) {
            req.flash('error_msg', 'Invalid plan month.');
            return res.redirect('/dashboard');
        }

        if (parsed_income === null) {
            req.flash('error_msg', 'Planned income must be a valid non-negative number.');
            const qs = new URLSearchParams();
            if (is_valid_iso_date(redirect_from)) {
                qs.set('from_date', redirect_from);
            }
            if (is_valid_iso_date(redirect_to)) {
                qs.set('to_date', redirect_to);
            }
            qs.set('trend_granularity', trend_granularity);
            return res.redirect(`/dashboard?${qs.toString()}`);
        }

        await monthly_income_plan.upsert_planned_income(user_id, plan_month, parsed_income);
        req.flash('success_msg', `Planned income for ${format_plan_month_label(plan_month)} saved.`);

        const qs = new URLSearchParams();
        if (is_valid_iso_date(redirect_from)) {
            qs.set('from_date', redirect_from);
        }
        if (is_valid_iso_date(redirect_to)) {
            qs.set('to_date', redirect_to);
        }
        qs.set('trend_granularity', trend_granularity);
        return res.redirect(`/dashboard?${qs.toString()}`);
    } catch (err) {
        if (err.isMigrationRequired) {
            req.flash('error_msg', err.message);
            const qs = new URLSearchParams();
            const redirect_from = String(req.body.redirect_from_date || '').trim();
            const redirect_to = String(req.body.redirect_to_date || '').trim();
            const trend_granularity = sanitize_enum(
                req.body.redirect_trend_granularity,
                ['day', 'month', 'year'],
                'month'
            );
            if (is_valid_iso_date(redirect_from)) {
                qs.set('from_date', redirect_from);
            }
            if (is_valid_iso_date(redirect_to)) {
                qs.set('to_date', redirect_to);
            }
            qs.set('trend_granularity', trend_granularity);
            return res.redirect(`/dashboard?${qs.toString()}`);
        }
        next(err);
    }
}

module.exports = { index, save_planned_income };