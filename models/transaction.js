const {
	pool
} = require('../utils/db');

async function count_all(user_id, filters = {}) {
	const from_date = filters.from_date || null;
	const to_date = filters.to_date || null;

	const sql = `
        SELECT COUNT(*) AS total
        FROM transactions
        WHERE user_id = ?
          AND (? IS NULL OR transaction_date >= ?)
          AND (? IS NULL OR transaction_date <= ?)
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		from_date,
		from_date,
		to_date,
		to_date,
		1
	]);
	return rows[0]?.total || 0;
}

async function get_list(user_id, limit, offset, filters = {}) {
	const from_date = filters.from_date || null;
	const to_date = filters.to_date || null;

	const sql = `
        SELECT
            t.id,
            t.transaction_date,
            t.transaction_type,
            t.amount,
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
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT ? OFFSET ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		from_date,
		from_date,
		to_date,
		to_date,
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
            transaction_type,
            amount,
            category_id,
            subcategory_id,
            account_id,
            transfer_to_account_id,
            payment_method,
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

async function create_with_balance_update(data) {
	const connection = await pool.getConnection();

	try {
		await connection.beginTransaction();

		const from_account_sql = `
            SELECT
                id,
                user_id,
                account_name,
                current_balance,
                is_active
            FROM accounts
            WHERE id = ?
              AND user_id = ?
            LIMIT ?
        `;

		const [from_account_rows] = await connection.query(from_account_sql, [
			data.account_id,
			data.user_id,
			1
		]);

		const from_account = from_account_rows[0] || null;

		if (!from_account || Number(from_account.is_active) !== 1) {
			throw new Error('SOURCE_ACCOUNT_INVALID');
		}

		let to_account = null;

		if (data.transaction_type === 'transfer') {
			if (!data.transfer_to_account_id) {
				throw new Error('TRANSFER_DESTINATION_REQUIRED');
			}

			if (Number(data.account_id) === Number(data.transfer_to_account_id)) {
				throw new Error('TRANSFER_ACCOUNT_SAME');
			}

			const to_account_sql = `
                SELECT
                    id,
                    user_id,
                    account_name,
                    current_balance,
                    is_active
                FROM accounts
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			const [to_account_rows] = await connection.query(to_account_sql, [
				data.transfer_to_account_id,
				data.user_id,
				1
			]);

			to_account = to_account_rows[0] || null;

			if (!to_account || Number(to_account.is_active) !== 1) {
				throw new Error('DESTINATION_ACCOUNT_INVALID');
			}
		}

		if (
			data.transaction_type === 'expense' ||
			data.transaction_type === 'transfer'
		) {
			if (Number(from_account.current_balance) < Number(data.amount)) {
				throw new Error('INSUFFICIENT_BALANCE');
			}
		}

		const insert_sql = `
            INSERT INTO transactions (
                user_id,
                transaction_date,
                transaction_type,
                amount,
                category_id,
                subcategory_id,
                account_id,
                transfer_to_account_id,
                payment_method,
                description,
                reference_no
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

		const [insert_result] = await connection.query(insert_sql, [
			data.user_id,
			data.transaction_date,
			data.transaction_type,
			data.amount,
			data.category_id || null,
			data.subcategory_id || null,
			data.account_id,
			data.transfer_to_account_id || null,
			data.payment_method,
			data.description || null,
			data.reference_no || null
		]);

		if (data.transaction_type === 'income') {
			const update_from_sql = `
                UPDATE accounts
                SET current_balance = ?
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			await connection.query(update_from_sql, [
				Number(from_account.current_balance) + Number(data.amount),
				data.account_id,
				data.user_id,
				1
			]);
		}

		if (data.transaction_type === 'expense') {
			const update_from_sql = `
                UPDATE accounts
                SET current_balance = ?
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			await connection.query(update_from_sql, [
				Number(from_account.current_balance) - Number(data.amount),
				data.account_id,
				data.user_id,
				1
			]);
		}

		if (data.transaction_type === 'transfer') {
			const update_from_sql = `
                UPDATE accounts
                SET current_balance = ?
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			await connection.query(update_from_sql, [
				Number(from_account.current_balance) - Number(data.amount),
				data.account_id,
				data.user_id,
				1
			]);

			const update_to_sql = `
                UPDATE accounts
                SET current_balance = ?
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			await connection.query(update_to_sql, [
				Number(to_account.current_balance) + Number(data.amount),
				data.transfer_to_account_id,
				data.user_id,
				1
			]);
		}

		await connection.commit();

		return {
			id: insert_result.insertId
		};
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

async function find_full_by_id(id, user_id) {
	const sql = `
        SELECT
            id,
            user_id,
            transaction_date,
            transaction_type,
            amount,
            category_id,
            subcategory_id,
            account_id,
            transfer_to_account_id,
            payment_method,
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

		const old_transaction_sql = `
            SELECT
                id,
                user_id,
                transaction_date,
                transaction_type,
                amount,
                category_id,
                subcategory_id,
                account_id,
                transfer_to_account_id,
                payment_method,
                description,
                reference_no
            FROM transactions
            WHERE id = ?
              AND user_id = ?
            LIMIT ?
        `;

		const [old_transaction_rows] = await connection.query(old_transaction_sql, [
			data.id,
			data.user_id,
			1
		]);

		const old_transaction = old_transaction_rows[0] || null;

		if (!old_transaction) {
			throw new Error('TRANSACTION_NOT_FOUND');
		}

		const account_ids = new Set();

		if (old_transaction.account_id) {
			account_ids.add(Number(old_transaction.account_id));
		}

		if (old_transaction.transfer_to_account_id) {
			account_ids.add(Number(old_transaction.transfer_to_account_id));
		}

		if (data.account_id) {
			account_ids.add(Number(data.account_id));
		}

		if (data.transfer_to_account_id) {
			account_ids.add(Number(data.transfer_to_account_id));
		}

		const account_map = {};

		for (const account_id of account_ids) {
			const account_sql = `
                SELECT
                    id,
                    user_id,
                    account_name,
                    current_balance,
                    is_active
                FROM accounts
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			const [account_rows] = await connection.query(account_sql, [
				account_id,
				data.user_id,
				1
			]);

			const account_item = account_rows[0] || null;

			if (!account_item) {
				throw new Error('ACCOUNT_NOT_FOUND');
			}

			account_map[account_id] = {
				id: Number(account_item.id),
				current_balance: Number(account_item.current_balance || 0),
				is_active: Number(account_item.is_active || 0)
			};
		}

		function applyReverseEffect(transaction_item) {
			const amount = Number(transaction_item.amount || 0);
			const from_id = Number(transaction_item.account_id || 0);
			const to_id = Number(transaction_item.transfer_to_account_id || 0);

			if (transaction_item.transaction_type === 'income') {
				account_map[from_id].current_balance -= amount;
			}

			if (transaction_item.transaction_type === 'expense') {
				account_map[from_id].current_balance += amount;
			}

			if (transaction_item.transaction_type === 'transfer') {
				account_map[from_id].current_balance += amount;
				account_map[to_id].current_balance -= amount;
			}
		}

		function validateNewTransactionInput() {
			if (!['income', 'expense', 'transfer'].includes(data.transaction_type)) {
				throw new Error('INVALID_TRANSACTION_TYPE');
			}

			if (Number(data.amount) <= 0) {
				throw new Error('INVALID_AMOUNT');
			}

			if (!data.account_id) {
				throw new Error('SOURCE_ACCOUNT_INVALID');
			}

			const source_account = account_map[Number(data.account_id)] || null;

			if (!source_account || Number(source_account.is_active) !== 1) {
				throw new Error('SOURCE_ACCOUNT_INVALID');
			}

			if (data.transaction_type === 'transfer') {
				if (!data.transfer_to_account_id) {
					throw new Error('TRANSFER_DESTINATION_REQUIRED');
				}

				if (Number(data.account_id) === Number(data.transfer_to_account_id)) {
					throw new Error('TRANSFER_ACCOUNT_SAME');
				}

				const destination_account = account_map[Number(data.transfer_to_account_id)] || null;

				if (!destination_account || Number(destination_account.is_active) !== 1) {
					throw new Error('DESTINATION_ACCOUNT_INVALID');
				}
			}
		}

		function applyNewEffect(transaction_item) {
			const amount = Number(transaction_item.amount || 0);
			const from_id = Number(transaction_item.account_id || 0);
			const to_id = Number(transaction_item.transfer_to_account_id || 0);

			if (transaction_item.transaction_type === 'income') {
				account_map[from_id].current_balance += amount;
			}

			if (transaction_item.transaction_type === 'expense') {
				if (account_map[from_id].current_balance < amount) {
					throw new Error('INSUFFICIENT_BALANCE');
				}

				account_map[from_id].current_balance -= amount;
			}

			if (transaction_item.transaction_type === 'transfer') {
				if (account_map[from_id].current_balance < amount) {
					throw new Error('INSUFFICIENT_BALANCE');
				}

				account_map[from_id].current_balance -= amount;
				account_map[to_id].current_balance += amount;
			}
		}

		applyReverseEffect(old_transaction);

		validateNewTransactionInput();

		applyNewEffect({
			transaction_type: data.transaction_type,
			amount: data.amount,
			account_id: data.account_id,
			transfer_to_account_id: data.transfer_to_account_id
		});

		for (const account_id of Object.keys(account_map)) {
			const update_account_sql = `
                UPDATE accounts
                SET current_balance = ?
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			await connection.query(update_account_sql, [
				account_map[account_id].current_balance,
				Number(account_id),
				data.user_id,
				1
			]);
		}

		const update_transaction_sql = `
            UPDATE transactions
            SET
                transaction_date = ?,
                transaction_type = ?,
                amount = ?,
                category_id = ?,
                subcategory_id = ?,
                account_id = ?,
                transfer_to_account_id = ?,
                payment_method = ?,
                description = ?,
                reference_no = ?
            WHERE id = ?
              AND user_id = ?
            LIMIT ?
        `;

		const [update_result] = await connection.query(update_transaction_sql, [
			data.transaction_date,
			data.transaction_type,
			data.amount,
			data.category_id || null,
			data.subcategory_id || null,
			data.account_id,
			data.transfer_to_account_id || null,
			data.payment_method,
			data.description || null,
			data.reference_no || null,
			data.id,
			data.user_id,
			1
		]);

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

		const transaction_sql = `
            SELECT
                id,
                user_id,
                transaction_type,
                amount,
                account_id,
                transfer_to_account_id
            FROM transactions
            WHERE id = ?
              AND user_id = ?
            LIMIT ?
        `;

		const [transaction_rows] = await connection.query(transaction_sql, [
			id,
			user_id,
			1
		]);

		const item = transaction_rows[0] || null;

		if (!item) {
			throw new Error('TRANSACTION_NOT_FOUND');
		}

		const account_ids = new Set();

		if (item.account_id) {
			account_ids.add(Number(item.account_id));
		}

		if (item.transfer_to_account_id) {
			account_ids.add(Number(item.transfer_to_account_id));
		}

		const account_map = {};

		for (const account_id of account_ids) {
			const account_sql = `
                SELECT
                    id,
                    user_id,
                    current_balance
                FROM accounts
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			const [account_rows] = await connection.query(account_sql, [
				account_id,
				user_id,
				1
			]);

			const account_item = account_rows[0] || null;

			if (!account_item) {
				throw new Error('ACCOUNT_NOT_FOUND');
			}

			account_map[account_id] = {
				id: Number(account_item.id),
				current_balance: Number(account_item.current_balance || 0)
			};
		}

		const amount = Number(item.amount || 0);
		const from_id = Number(item.account_id || 0);
		const to_id = Number(item.transfer_to_account_id || 0);

		if (item.transaction_type === 'income') {
			if (account_map[from_id].current_balance < amount) {
				throw new Error('INVALID_BALANCE_REVERSE');
			}

			account_map[from_id].current_balance -= amount;
		}

		if (item.transaction_type === 'expense') {
			account_map[from_id].current_balance += amount;
		}

		if (item.transaction_type === 'transfer') {
			if (account_map[to_id].current_balance < amount) {
				throw new Error('INVALID_BALANCE_REVERSE');
			}

			account_map[from_id].current_balance += amount;
			account_map[to_id].current_balance -= amount;
		}

		for (const account_id of Object.keys(account_map)) {
			const update_account_sql = `
                UPDATE accounts
                SET current_balance = ?
                WHERE id = ?
                  AND user_id = ?
                LIMIT ?
            `;

			await connection.query(update_account_sql, [
				account_map[account_id].current_balance,
				Number(account_id),
				user_id,
				1
			]);
		}

		const delete_sql = `
            DELETE FROM transactions
            WHERE id = ?
              AND user_id = ?
            LIMIT ?
        `;

		const [delete_result] = await connection.query(delete_sql, [
			id,
			user_id,
			1
		]);

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
          AND (? = '' OR t.description LIKE CONCAT('%', ?, '%'))
        ORDER BY t.transaction_date DESC, t.id DESC
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