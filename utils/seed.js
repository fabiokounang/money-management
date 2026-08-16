const {
  pool
} = require('./db');

const DEFAULT_CATEGORY_TREE = [
  // income
  {
    name: 'Salary',
    type: 'income',
    icon: '💼',
    color: 'green',
    subcategories: [
      'Monthly Salary',
      'Bonus',
      'Overtime',
      'Allowance',
      'Severance'
    ]
  },
  {
    name: 'Business',
    type: 'income',
    icon: '🏢',
    color: 'blue',
    subcategories: [
      'Sales',
      'Consulting',
      'Commission',
      'Side Hustle',
      'Freelance'
    ]
  },
  {
    name: 'Investment',
    type: 'income',
    icon: '📈',
    color: 'purple',
    subcategories: [
      'Dividends',
      'Interest',
      'Capital Gains',
      'Rental Income',
      'Crypto Gains'
    ]
  },

  // expense
  {
    name: 'Food',
    type: 'expense',
    icon: '🍜',
    color: 'orange',
    subcategories: [
      'Breakfast',
      'Lunch',
      'Dinner',
      'Snacks',
      'Coffee',
      'Groceries',
      'Delivery',
      'Restaurant',
      'Fast Food',
      'Drinks'
    ]
  },
  {
    name: 'Transport',
    type: 'expense',
    icon: '🚗',
    color: 'blue',
    subcategories: [
      'Fuel',
      'Taxi / Ride-hail',
      'Public Transport',
      'Parking',
      'Toll',
      'Maintenance',
      'Vehicle Tax',
      'Car Wash',
      'Train / Bus Ticket',
      'Flight'
    ]
  },
  {
    name: 'Shopping',
    type: 'expense',
    icon: '🛍️',
    color: 'pink',
    subcategories: [
      'Clothes',
      'Electronics',
      'Home Goods',
      'Beauty',
      'Gifts',
      'Online Shopping',
      'Accessories',
      'Shoes',
      'Furniture',
      'Personal Care'
    ]
  },
  {
    name: 'Bills',
    type: 'expense',
    icon: '📄',
    color: 'gray',
    subcategories: [
      // Utilities
      'Electricity',
      'Water',
      'Gas',
      'Internet',
      'Mobile Phone',
      'TV / Cable',
      // Housing
      'Rent',
      'Mortgage',
      'Building / HOA Fee',
      'Property Tax',
      // Insurance
      'Home Insurance',
      'Health Insurance',
      'Life Insurance',
      // Financial obligations
      'Credit Card Payment',
      'Loan Repayment',
      'Bank Fees',
      // Subscriptions
      'Streaming Subscription',
      'Cloud Storage',
      'Software Subscription',
      // Government / tax
      'Income Tax',
      'Vehicle Tax'
    ]
  },
  {
    name: 'Entertainment',
    type: 'expense',
    icon: '🎮',
    color: 'purple',
    subcategories: [
      // Sports
      'Basketball',
      'Padel',
      'Football',
      'Tennis',
      'Badminton',
      'Swimming',
      'Gym / Fitness',
      'Running',
      'Cycling',
      'Golf',
      // Media & leisure
      'Movies',
      'Games',
      'Concerts',
      'Music',
      'Books',
      'Streaming',
      'Karaoke',
      'Theme Parks',
      'Night Out',
      'Hobbies',
      'Board Games',
      'Sports Equipment',
      'Travel / Outing'
    ]
  }
];

async function seed_user_default_data(user_id) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ======================
    // 1. DEFAULT CATEGORIES
    // ======================
    const categoryValues = DEFAULT_CATEGORY_TREE.map((c) => [
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

    const categoryIdByName = {};
    const startId = categoryResult.insertId;

    for (let i = 0; i < DEFAULT_CATEGORY_TREE.length; i += 1) {
      categoryIdByName[DEFAULT_CATEGORY_TREE[i].name] = startId + i;
    }

    // ======================
    // 2. DEFAULT SUBCATEGORIES
    // ======================
    const subcategoryValues = [];

    for (const category of DEFAULT_CATEGORY_TREE) {
      const categoryId = categoryIdByName[category.name];
      for (const subName of category.subcategories) {
        subcategoryValues.push([categoryId, subName, 1]);
      }
    }

    if (subcategoryValues.length > 0) {
      const insertSubSql = `
            INSERT INTO subcategories (
                category_id,
                subcategory_name,
                is_active
            ) VALUES ?
        `;

      await connection.query(insertSubSql, [subcategoryValues]);
    }

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
  seed_user_default_data,
  DEFAULT_CATEGORY_TREE
};
