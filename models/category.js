const {
	pool
} = require('../utils/db');

async function get_active_by_type(user_id, category_type) {
	const sql = `
        SELECT
            id,
            category_name,
            category_type
        FROM categories
        WHERE user_id = ?
          AND category_type = ?
          AND is_active = ?
        ORDER BY category_name ASC
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		category_type,
		1,
		1000
	]);

	return rows;
}

async function get_subcategories(category_id, user_id) {
	const sql = `
        SELECT
            s.id,
            s.subcategory_name
        FROM subcategories s
        JOIN categories c
            ON c.id = s.category_id
        WHERE s.category_id = ?
          AND c.user_id = ?
          AND s.is_active = ?
        ORDER BY s.subcategory_name ASC
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		category_id,
		user_id,
		1,
		1000
	]);

	return rows;
}

async function get_list(user_id, limit, offset, search, category_type, is_active) {
	const sql = `
        SELECT
            id,
            category_name,
            category_type,
            icon,
            color,
            is_active,
            created_at,
            updated_at
        FROM categories
        WHERE user_id = ?
          AND (? = '' OR category_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR category_type = ?)
          AND (? = -1 OR is_active = ?)
        ORDER BY category_name ASC, id DESC
        LIMIT ? OFFSET ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		search,
		search,
		category_type,
		category_type,
		is_active,
		is_active,
		limit,
		offset
	]);

	return rows;
}

async function count_all(user_id, search, category_type, is_active) {
	const sql = `
        SELECT COUNT(*) AS total
        FROM categories
        WHERE user_id = ?
          AND (? = '' OR category_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR category_type = ?)
          AND (? = -1 OR is_active = ?)
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		search,
		search,
		category_type,
		category_type,
		is_active,
		is_active,
		1
	]);

	return rows[0]?.total || 0;
}

async function find_by_id(id, user_id) {
	const sql = `
        SELECT
            id,
            user_id,
            category_name,
            category_type,
            icon,
            color,
            is_active,
            created_at,
            updated_at
        FROM categories
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [id, user_id, 1]);
	return rows[0] || null;
}

async function find_by_name_and_type(user_id, category_name, category_type, exclude_id) {
	const sql = `
        SELECT
            id,
            category_name,
            category_type
        FROM categories
        WHERE user_id = ?
          AND category_name = ?
          AND category_type = ?
          AND (? = 0 OR id != ?)
        LIMIT ?
    `;

	const [rows] = await pool.query(sql, [
		user_id,
		category_name,
		category_type,
		exclude_id,
		exclude_id,
		1
	]);

	return rows[0] || null;
}

async function create(data) {
	const sql = `
        INSERT INTO categories (
            user_id,
            category_name,
            category_type,
            icon,
            color,
            is_active
        ) VALUES (?, ?, ?, ?, ?, ?)
    `;

	const [result] = await pool.query(sql, [
		data.user_id,
		data.category_name,
		data.category_type,
		data.icon || null,
		data.color || null,
		data.is_active
	]);

	return result.insertId;
}

async function update(data) {
	const sql = `
        UPDATE categories
        SET
            category_name = ?,
            category_type = ?,
            icon = ?,
            color = ?,
            is_active = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

	const [result] = await pool.query(sql, [
		data.category_name,
		data.category_type,
		data.icon || null,
		data.color || null,
		data.is_active,
		data.id,
		data.user_id,
		1
	]);

	return result.affectedRows;
}

async function count_transactions_by_category(id, user_id) {
    const sql = `
        SELECT COUNT(*) AS total
        FROM transactions
        WHERE user_id = ?
          AND category_id = ?
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [
        user_id,
        id,
        1
    ]);

    return rows[0]?.total || 0;
}

async function remove(id, user_id) {
    const sql = `
        DELETE FROM categories
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
	get_active_by_type,
	get_subcategories,
	get_list,
	count_all,
	find_by_id,
	find_by_name_and_type,
	create,
	update,
    count_transactions_by_category,
    remove
};