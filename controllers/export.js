const transaction = require('../models/transaction');
const {
    normalize_date_range,
    normalize_enum,
    normalize_positive_int
} = require('../utils/validation');

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

        const date_range = normalize_date_range(req.query.from_date, req.query.to_date);

        if (!date_range.ok) {
            return res.status(400).json({
                success: false,
                message: date_range.error
            });
        }

        const type_result = normalize_enum(req.query.transaction_type || '', [
            '',
            'income',
            'expense',
            'transfer'
        ]);

        if (!type_result.ok) {
            return res.status(400).json({
                success: false,
                message: 'Invalid transaction_type filter'
            });
        }

        const account_id_result = normalize_positive_int(req.query.account_id, {
            required: false,
            defaultValue: 0
        });
        if (!account_id_result.ok) {
            return res.status(400).json({
                success: false,
                message: 'Invalid account_id filter'
            });
        }

        const category_id_result = normalize_positive_int(req.query.category_id, {
            required: false,
            defaultValue: 0
        });
        if (!category_id_result.ok) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category_id filter'
            });
        }

        const from_date = date_range.from_date;
        const to_date = date_range.to_date;
        const transaction_type = type_result.value;
        const account_id = account_id_result.value;
        const category_id = category_id_result.value;

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