const {
	pool
} = require('../utils/db');

async function find_by_id(id, user_id) {
	const sql = `
        SELECT
            id,
            user_id,
            account_name,
            account_type,
            opening_balance,
            current_balance,
            account_color,
            note,
            is_active,
            created_at,
            updated_at
        FROM accounts
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [id, user_id, 1]);
	return rows[0] || null;
}

async function update_balance(id, user_id, current_balance) {
	const sql = `
        UPDATE accounts
        SET current_balance = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [result] = await pool.query(sql, [
		current_balance,
		id,
		user_id,
		1
	]);

	return result.affectedRows;
}

async function get_active_accounts(user_id) {
	const sql = `
        SELECT
            id,
            account_name,
            account_type,
            current_balance
        FROM accounts
        WHERE user_id = ?
          AND is_active = ?
        ORDER BY account_name ASC
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		1,
		1000
	]);

	return rows;
}

async function get_list(user_id, limit, offset, search, account_type, is_active) {
	const sql = `
        SELECT
            id,
            account_name,
            account_type,
            opening_balance,
            current_balance,
            account_color,
            note,
            is_active,
            created_at,
            updated_at
        FROM accounts
        WHERE user_id = ?
          AND (? = '' OR account_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR account_type = ?)
          AND (? = -1 OR is_active = ?)
        ORDER BY account_name ASC, id DESC
        LIMIT ? OFFSET ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		search,
		search,
		account_type,
		account_type,
		is_active,
		is_active,
		limit,
		offset
	]);

	return rows;
}

async function count_all(user_id, search, account_type, is_active) {
	const sql = `
        SELECT COUNT(*) AS total
        FROM accounts
        WHERE user_id = ?
          AND (? = '' OR account_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR account_type = ?)
          AND (? = -1 OR is_active = ?)
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		search,
		search,
		account_type,
		account_type,
		is_active,
		is_active,
		1
	]);

	return rows[0]?.total || 0;
}

async function find_by_name(user_id, account_name, exclude_id) {
	const sql = `
        SELECT
            id,
            account_name
        FROM accounts
        WHERE user_id = ?
          AND account_name = ?
          AND (? = 0 OR id != ?)
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		account_name,
		exclude_id,
		exclude_id,
		1
	]);

	return rows[0] || null;
}

async function create(data) {
	const sql = `
        INSERT INTO accounts (
            user_id,
            account_name,
            account_type,
            opening_balance,
            current_balance,
            account_color,
            note,
            is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

	const [result] = await pool.query(sql, [
		data.user_id,
		data.account_name,
		data.account_type,
		data.opening_balance,
		data.current_balance,
		data.account_color || null,
		data.note || null,
		data.is_active
	]);

	return result.insertId;
}

async function update(data) {
	const sql = `
        UPDATE accounts
        SET
            account_name = ?,
            account_type = ?,
            opening_balance = ?,
            account_color = ?,
            note = ?,
            is_active = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [result] = await pool.query(sql, [
		data.account_name,
		data.account_type,
		data.opening_balance,
		data.account_color || null,
		data.note || null,
		data.is_active,
		data.id,
		data.user_id,
		1
	]);

	return result.affectedRows;
}

async function count_transactions_by_account(id, user_id) {
    const sql = `
        SELECT COUNT(*) AS total
        FROM transactions
        WHERE user_id = ?
          AND (account_id = ? OR transfer_to_account_id = ?)
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [
        user_id,
        id,
        id,
        1
    ]);

    return rows[0]?.total || 0;
}

async function remove(id, user_id) {
    const sql = `
        DELETE FROM accounts
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

    const [result] = await pool.query(sql, [
        id,
        user_id,
        1
    ]);

    return result.affectedRows;
}

module.exports = {
	find_by_id,
	update_balance,
	get_active_accounts,
	get_list,
	count_all,
	find_by_name,
	create,
	update,
    count_transactions_by_account,
    remove
};