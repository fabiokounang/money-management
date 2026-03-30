const transaction = require('../models/transaction');

function escape_csv(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);

    if (
        stringValue.includes(',') ||
        stringValue.includes('"') ||
        stringValue.includes('\n')
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

function build_csv(rows) {
    const headers = [
        'ID',
        'Transaction Date',
        'Transaction Type',
        'Amount',
        'Payment Method',
        'Category',
        'Subcategory',
        'From Account',
        'To Account',
        'Description',
        'Reference No'
    ];

    const lines = [headers.join(',')];

    rows.forEach((item) => {
        const row = [
            item.id,
            item.transaction_date ? String(item.transaction_date).slice(0, 10) : '',
            item.transaction_type || '',
            Number(item.amount || 0),
            item.payment_method || '',
            item.category_name || '',
            item.subcategory_name || '',
            item.account_name || '',
            item.transfer_to_account_name || '',
            item.description || '',
            item.reference_no || ''
        ].map(escape_csv);

        lines.push(row.join(','));
    });

    return lines.join('\n');
}

async function transactions_csv(req, res, next) {
    try {
        const user_id = req.session.user.id;

        const from_date = req.query.from_date || '';
        const to_date = req.query.to_date || '';
        const transaction_type = req.query.transaction_type || '';
        const account_id = Number(req.query.account_id || 0);
        const category_id = Number(req.query.category_id || 0);

        const rows = await transaction.get_export_list(user_id, {
            from_date,
            to_date,
            transaction_type,
            account_id,
            category_id
        });

        const csv = build_csv(rows);
        const filename = `transactions-${Date.now()}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.status(200).send(csv);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    transactions_csv
};