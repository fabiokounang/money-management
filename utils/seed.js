const {
  pool
} = require('./db');

async function seed_user_default_data(user_id) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ======================
    // 1. DEFAULT CATEGORIES
    // ======================
    const categories = [
      // income
      {
        name: 'Salary',
        type: 'income',
        icon: '💼',
        color: 'green'
      },
      {
        name: 'Business',
        type: 'income',
        icon: '🏢',
        color: 'blue'
      },
      {
        name: 'Investment',
        type: 'income',
        icon: '📈',
        color: 'purple'
      },

      // expense
      {
        name: 'Food',
        type: 'expense',
        icon: '🍜',
        color: 'orange'
      },
      {
        name: 'Transport',
        type: 'expense',
        icon: '🚗',
        color: 'blue'
      },
      {
        name: 'Shopping',
        type: 'expense',
        icon: '🛍️',
        color: 'pink'
      },
      {
        name: 'Bills',
        type: 'expense',
        icon: '📄',
        color: 'gray'
      },
      {
        name: 'Entertainment',
        type: 'expense',
        icon: '🎮',
        color: 'purple'
      }
    ];

    const categoryValues = categories.map((c) => [
      user_id,
      c.name,
      c.type,
      c.icon,
      c.color,
      1
    ]);

    const insertCategorySql = `
            INSERT INTO categories (
                user_id,
                category_name,
                category_type,
                icon,
                color,
                is_active
            ) VALUES ?
        `;

    const [categoryResult] = await connection.query(insertCategorySql, [categoryValues]);

    // get id of newly inserted row
    const insertedCategoryIds = [];
    let startId = categoryResult.insertId;

    for (let i = 0; i < categories.length; i += 1) {
      insertedCategoryIds.push(startId + i);
    }

    // ======================
    // 2. DEFAULT SUBCATEGORY
    // ======================
    const subcategories = [
      // Food
      {
        name: 'Breakfast',
        index: 3
      },
      {
        name: 'Lunch',
        index: 3
      },
      {
        name: 'Dinner',
        index: 3
      },

      // Transport
      {
        name: 'Fuel',
        index: 4
      },
      {
        name: 'Taxi',
        index: 4
      },

      // Shopping
      {
        name: 'Clothes',
        index: 5
      },
      {
        name: 'Electronics',
        index: 5
      },

      // Bills
      {
        name: 'Electricity',
        index: 6
      },
      {
        name: 'Internet',
        index: 6
      },

      // Entertainment
      {
        name: 'Movies',
        index: 7
      },
      {
        name: 'Games',
        index: 7
      }
    ];

    const subcategoryValues = subcategories.map((s) => [
      insertedCategoryIds[s.index],
      s.name,
      1
    ]);

    const insertSubSql = `
            INSERT INTO subcategories (
                category_id,
                subcategory_name,
                is_active
            ) VALUES ?
        `;

    await connection.query(insertSubSql, [subcategoryValues]);

    // ======================
    // 3. DEFAULT ACCOUNT
    // ======================
    const accountSql = `
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

    await connection.execute(accountSql, [
      user_id,
      'Cash',
      'cash',
      0,
      0,
      null,
      'Default seeded account',
      1
    ]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  seed_user_default_data
};