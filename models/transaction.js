const {
	pool
} = require('../utils/db');
const loan = require('./loan');
const {
	money,
	normalize_debt_cash_effect,
	apply_transaction_effects
} = require('../utils/accountBalance');

async function count_all(user_id, filters = {}) {
	const from_date = filters.from_date || null;
	const to_date = filters.to_date || null;
	const transaction_type = filters.transaction_type || '';
	const account_id = Number(filters.account_id || 0);
	const category_id = Number(filters.category_id || 0);
	const include_in_dashboard = Number.isInteger(Number(filters.include_in_dashboard)) ? Number(filters.include_in_dashboard) : -1;
	const include_in_budget = Number.isInteger(Number(filters.include_in_budget)) ? Number(filters.include_in_budget) : -1;
	const search = filters.search || '';

	const sql = `
        SELECT COUNT(*) AS total
        FROM transactions t
        WHERE t.user_id = ?
          AND (? IS NULL OR t.transaction_date >= ?)
          AND (? IS NULL OR t.transaction_date <= ?)
          AND (? = '' OR t.transaction_type = ?)
          AND (? = 0 OR t.account_id = ? OR t.transfer_to_account_id = ?)
          AND (? = 0 OR t.category_id = ?)
          AND (? = -1 OR t.include_in_dashboard = ?)
          AND (? = -1 OR t.include_in_budget = ?)
          AND (
            ? = ''
            OR t.description LIKE CONCAT('%', ?, '%')
            OR t.reference_no LIKE CONCAT('%', ?, '%')
          )
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		from_date,
		from_date,
		to_date,
		to_date,
		transaction_type,
		transaction_type,
		account_id,
		account_id,
		account_id,
		category_id,
		category_id,
		include_in_dashboard,
		include_in_dashboard,
		include_in_budget,
		include_in_budget,
		search,
		search,
		search,
		1
	]);
	return rows[0]?.total || 0;
}

async function get_list(user_id, limit, offset, filters = {}) {
	const from_date = filters.from_date || null;
	const to_date = filters.to_date || null;
	const transaction_type = filters.transaction_type || '';
	const account_id = Number(filters.account_id || 0);
	const category_id = Number(filters.category_id || 0);
	const include_in_dashboard = Number.isInteger(Number(filters.include_in_dashboard)) ? Number(filters.include_in_dashboard) : -1;
	const include_in_budget = Number.isInteger(Number(filters.include_in_budget)) ? Number(filters.include_in_budget) : -1;
	const search = filters.search || '';

	const sql = `
        SELECT
            t.id,
            t.transaction_date,
            t.transaction_time,
            t.transaction_type,
            t.debt_cash_effect,
            t.amount,
            t.include_in_dashboard,
            t.include_in_budget,
            t.description,
            t.reference_no,
            a.account_name,
            ta.account_name AS transfer_to_account_name,
            c.category_name,
            s.subcategory_name
        FROM transactions t
        LEFT JOIN accounts a
            ON a.id = t.account_id
        LEFT JOIN accounts ta
            ON ta.id = t.transfer_to_account_id
        LEFT JOIN categories c
            ON c.id = t.category_id
        LEFT JOIN subcategories s
            ON s.id = t.subcategory_id
        WHERE t.user_id = ?
          AND (? IS NULL OR t.transaction_date >= ?)
          AND (? IS NULL OR t.transaction_date <= ?)
          AND (? = '' OR t.transaction_type = ?)
          AND (? = 0 OR t.account_id = ? OR t.transfer_to_account_id = ?)
          AND (? = 0 OR t.category_id = ?)
          AND (? = -1 OR t.include_in_dashboard = ?)
          AND (? = -1 OR t.include_in_budget = ?)
          AND (
            ? = ''
            OR t.description LIKE CONCAT('%', ?, '%')
            OR t.reference_no LIKE CONCAT('%', ?, '%')
          )
        ORDER BY t.transaction_date DESC, t.transaction_time DESC, t.id DESC
        LIMIT ? OFFSET ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		from_date,
		from_date,
		to_date,
		to_date,
		transaction_type,
		transaction_type,
		account_id,
		account_id,
		account_id,
		category_id,
		category_id,
		include_in_dashboard,
		include_in_dashboard,
		include_in_budget,
		include_in_budget,
		search,
		search,
		search,
		limit,
		offset
	]);
	return rows;
}

async function find_by_id(id, user_id) {
	const sql = `
        SELECT
            id,
            user_id,
            transaction_date,
            transaction_time,
            transaction_type,
            debt_cash_effect,
            amount,
            category_id,
            subcategory_id,
            account_id,
            transfer_to_account_id,
            payment_method,
            include_in_dashboard,
            include_in_budget,
            description,
            reference_no,
            created_at,
            updated_at
        FROM transactions
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [id, user_id, 1]);
	return rows[0] || null;
}

async function create_with_balance_update(data, existingConnection = null) {
	const ownsConnection = !existingConnection;
	const connection = existingConnection || await pool.getConnection();

	try {
		if (ownsConnection) {
			await connection.beginTransaction();
		}

		if (!['income', 'expense', 'transfer', 'debt'].includes(data.transaction_type)) {
			throw new Error('INVALID_TRANSACTION_TYPE');
		}

		const amount = money(data.amount);
		if (amount <= 0) {
			throw new Error('INVALID_AMOUNT');
		}

		if (!data.account_id) {
			throw new Error('SOURCE_ACCOUNT_INVALID');
		}

		let debt_cash_effect = 'in';
		if (data.transaction_type === 'debt') {
			if (data.linked_loan && data.linked_loan.loan_type === 'receivable') {
				debt_cash_effect = 'out';
			} else {
				debt_cash_effect = normalize_debt_cash_effect(data.debt_cash_effect, 'in');
			}
		}

		if (data.transaction_type === 'transfer') {
			if (!data.transfer_to_account_id) {
				throw new Error('TRANSFER_DESTINATION_REQUIRED');
			}
			if (Number(data.account_id) === Number(data.transfer_to_account_id)) {
				throw new Error('TRANSFER_ACCOUNT_SAME');
			}
		}

		const txPayload = {
			transaction_type: data.transaction_type,
			amount,
			account_id: data.account_id,
			transfer_to_account_id: data.transfer_to_account_id || null,
			debt_cash_effect
		};

		await apply_transaction_effects(connection, data.user_id, txPayload, 'apply');

		const insert_sql = `
            INSERT INTO transactions (
                user_id,
                transaction_date,
                transaction_time,
                transaction_type,
                debt_cash_effect,
                amount,
                category_id,
                subcategory_id,
                account_id,
                transfer_to_account_id,
                payment_method,
                include_in_dashboard,
                include_in_budget,
                description,
                reference_no
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

		const [insert_result] = await connection.query(insert_sql, [
			data.user_id,
			data.transaction_date,
			data.transaction_time || '00:00:00',
			data.transaction_type,
			data.transaction_type === 'debt' ? debt_cash_effect : 'in',
			amount,
			data.category_id || null,
			data.subcategory_id || null,
			data.account_id,
			data.transfer_to_account_id || null,
			data.payment_method,
			Number(data.include_in_dashboard) === 0 ? 0 : 1,
			Number(data.include_in_budget) === 0 ? 0 : 1,
			data.description || null,
			data.reference_no || null
		]);

		const transaction_id = insert_result.insertId;

		if (data.transaction_type === 'debt' && data.linked_loan) {
			const L = data.linked_loan;
			let loan_status = 'open';
			if (L.due_date && new Date(`${L.due_date}T23:59:59`) < new Date() && amount > 0) {
				loan_status = 'overdue';
			}
			await loan.createInConnection(connection, {
				user_id: data.user_id,
				loan_type: L.loan_type,
				counterparty_name: L.counterparty_name,
				principal_amount: amount,
				outstanding_amount: amount,
				start_date: data.transaction_date,
				due_date: L.due_date || null,
				status: loan_status,
				reminder_days: L.reminder_days || 0,
				note: L.note || null,
				source_transaction_id: transaction_id
			});
		}

		if (ownsConnection) {
			await connection.commit();
		}

		return {
			id: transaction_id
		};
	} catch (error) {
		if (ownsConnection) {
			await connection.rollback();
		}
		throw error;
	} finally {
		if (ownsConnection) {
			connection.release();
		}
	}
}

async function find_full_by_id(id, user_id) {
	const sql = `
        SELECT
            id,
            user_id,
            transaction_date,
            transaction_time,
            transaction_type,
            debt_cash_effect,
            amount,
            category_id,
            subcategory_id,
            account_id,
            transfer_to_account_id,
            payment_method,
            include_in_dashboard,
            include_in_budget,
            description,
            reference_no,
            created_at,
            updated_at
        FROM transactions
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [id, user_id, 1]);
	return rows[0] || null;
}

async function update_with_balance_update(data) {
	const connection = await pool.getConnection();

	try {
		await connection.beginTransaction();

		const [old_transaction_rows] = await connection.query(
			`
            SELECT
                id,
                user_id,
                transaction_date,
                transaction_time,
                transaction_type,
                debt_cash_effect,
                amount,
                category_id,
                subcategory_id,
                account_id,
                transfer_to_account_id,
                payment_method,
                include_in_dashboard,
                include_in_budget,
                description,
                reference_no
            FROM transactions
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            FOR UPDATE
            `,
			[data.id, data.user_id]
		);

		const old_transaction = old_transaction_rows[0] || null;
		if (!old_transaction) {
			throw new Error('TRANSACTION_NOT_FOUND');
		}

		const linkedPayment = await loan.find_payment_by_transaction_id_in_connection(
			connection,
			data.id,
			data.user_id
		);
		if (linkedPayment) {
			const amountChanged = money(data.amount) !== money(old_transaction.amount);
			const accountChanged = Number(data.account_id) !== Number(old_transaction.account_id);
			const typeChanged = String(data.transaction_type) !== String(old_transaction.transaction_type);
			const transferChanged = Number(data.transfer_to_account_id || 0) !== Number(old_transaction.transfer_to_account_id || 0);
			if (amountChanged || accountChanged || typeChanged || transferChanged) {
				throw new Error('LOAN_PAYMENT_TX_LOCKED');
			}
		}

		const sourceLoan = await loan.find_by_source_transaction_id_in_connection(
			connection,
			data.id,
			data.user_id
		);

		if (!['income', 'expense', 'transfer', 'debt'].includes(data.transaction_type)) {
			throw new Error('INVALID_TRANSACTION_TYPE');
		}

		const newAmount = money(data.amount);
		if (newAmount <= 0) {
			throw new Error('INVALID_AMOUNT');
		}

		if (!data.account_id) {
			throw new Error('SOURCE_ACCOUNT_INVALID');
		}

		if (data.transaction_type === 'transfer') {
			if (!data.transfer_to_account_id) {
				throw new Error('TRANSFER_DESTINATION_REQUIRED');
			}
			if (Number(data.account_id) === Number(data.transfer_to_account_id)) {
				throw new Error('TRANSFER_ACCOUNT_SAME');
			}
		}

		let debt_cash_effect = 'in';
		if (data.transaction_type === 'debt') {
			debt_cash_effect = normalize_debt_cash_effect(
				data.debt_cash_effect != null ? data.debt_cash_effect : old_transaction.debt_cash_effect,
				'in'
			);
		}

		await apply_transaction_effects(connection, data.user_id, old_transaction, 'reverse');

		await apply_transaction_effects(
			connection,
			data.user_id,
			{
				transaction_type: data.transaction_type,
				amount: newAmount,
				account_id: data.account_id,
				transfer_to_account_id: data.transfer_to_account_id || null,
				debt_cash_effect
			},
			'apply'
		);

		const [update_result] = await connection.query(
			`
            UPDATE transactions
            SET
                transaction_date = ?,
                transaction_time = ?,
                transaction_type = ?,
                debt_cash_effect = ?,
                amount = ?,
                category_id = ?,
                subcategory_id = ?,
                account_id = ?,
                transfer_to_account_id = ?,
                payment_method = ?,
                include_in_dashboard = ?,
                include_in_budget = ?,
                description = ?,
                reference_no = ?
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            `,
			[
				data.transaction_date,
				data.transaction_time || '00:00:00',
				data.transaction_type,
				data.transaction_type === 'debt' ? debt_cash_effect : 'in',
				newAmount,
				data.category_id || null,
				data.subcategory_id || null,
				data.account_id,
				data.transfer_to_account_id || null,
				data.payment_method,
				Number(data.include_in_dashboard) === 0 ? 0 : 1,
				Number(data.include_in_budget) === 0 ? 0 : 1,
				data.description || null,
				data.reference_no || null,
				data.id,
				data.user_id
			]
		);

		if (sourceLoan) {
			const paymentCount = await loan.count_payments_in_connection(connection, sourceLoan.id, data.user_id);
			const amountChanged = money(old_transaction.amount) !== newAmount;
			const typeChanged = String(old_transaction.transaction_type) !== String(data.transaction_type);
			if ((amountChanged || typeChanged) && paymentCount > 0) {
				throw new Error('LOAN_SOURCE_TX_HAS_PAYMENTS');
			}
			if (data.transaction_type === 'debt' && paymentCount === 0) {
				await loan.update_principal_from_source_tx_in_connection(connection, {
					loan_id: sourceLoan.id,
					user_id: data.user_id,
					principal_amount: newAmount,
					debt_cash_effect
				});
			} else if (data.transaction_type !== 'debt') {
				throw new Error('LOAN_SOURCE_TX_TYPE_LOCKED');
			}
		}

		await connection.commit();

		return {
			affected_rows: update_result.affectedRows
		};
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

async function delete_with_balance_update(id, user_id) {
	const connection = await pool.getConnection();

	try {
		await connection.beginTransaction();

		const [transaction_rows] = await connection.query(
			`
            SELECT
                id,
                user_id,
                transaction_type,
                debt_cash_effect,
                amount,
                account_id,
                transfer_to_account_id
            FROM transactions
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            FOR UPDATE
            `,
			[id, user_id]
		);

		const item = transaction_rows[0] || null;
		if (!item) {
			throw new Error('TRANSACTION_NOT_FOUND');
		}

		const linkedPayment = await loan.find_payment_by_transaction_id_in_connection(connection, id, user_id);
		if (linkedPayment) {
			await loan.reverse_payment_in_connection(connection, {
				payment_id: linkedPayment.id,
				loan_id: linkedPayment.loan_id,
				user_id,
				amount: money(linkedPayment.amount)
			});
		}

		const sourceLoan = await loan.find_by_source_transaction_id_in_connection(connection, id, user_id);
		if (sourceLoan) {
			const paymentCount = await loan.count_payments_in_connection(connection, sourceLoan.id, user_id);
			if (paymentCount > 0) {
				throw new Error('LOAN_SOURCE_TX_HAS_PAYMENTS');
			}
			await loan.delete_in_connection(connection, sourceLoan.id, user_id);
		}

		await apply_transaction_effects(connection, user_id, item, 'reverse');

		const [delete_result] = await connection.query(
			`
            DELETE FROM transactions
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
            `,
			[id, user_id]
		);

		await connection.commit();

		return {
			affected_rows: delete_result.affectedRows
		};
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}


async function get_export_list(user_id, filters) {
    const from_date = filters.from_date || null;
    const to_date = filters.to_date || null;
    const transaction_type = filters.transaction_type || '';
    const account_id = Number(filters.account_id || 0);
    const category_id = Number(filters.category_id || 0);
    const search = filters.search || '';

    const sql = `
        SELECT
            t.id,
            t.transaction_date,
            t.transaction_time,
            t.transaction_type,
            t.amount,
            t.payment_method,
            t.description,
            t.reference_no,
            a.account_name,
            ta.account_name AS transfer_to_account_name,
            c.category_name,
            s.subcategory_name
        FROM transactions t
        LEFT JOIN accounts a
            ON a.id = t.account_id
        LEFT JOIN accounts ta
            ON ta.id = t.transfer_to_account_id
        LEFT JOIN categories c
            ON c.id = t.category_id
        LEFT JOIN subcategories s
            ON s.id = t.subcategory_id
        WHERE t.user_id = ?
          AND (? IS NULL OR t.transaction_date >= ?)
          AND (? IS NULL OR t.transaction_date <= ?)
          AND (? = '' OR t.transaction_type = ?)
          AND (? = 0 OR t.account_id = ? OR t.transfer_to_account_id = ?)
          AND (? = 0 OR t.category_id = ?)
          AND (
            ? = ''
            OR t.description LIKE CONCAT('%', ?, '%')
            OR t.reference_no LIKE CONCAT('%', ?, '%')
          )
        ORDER BY t.transaction_date DESC, t.transaction_time DESC, t.id DESC
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [
        user_id,
        from_date,
        from_date,
        to_date,
        to_date,
        transaction_type,
        transaction_type,
        account_id,
        account_id,
        account_id,
        category_id,
        category_id,
        search,
        search,
        search,
        100000
    ]);

    return rows;
}

module.exports = {
	count_all,
	get_list,
	find_by_id,
	create_with_balance_update,
	find_full_by_id,
	update_with_balance_update,
	delete_with_balance_update,
	get_export_list
};