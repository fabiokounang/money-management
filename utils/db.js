const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

async function test_connection() {
    const connection = await pool.getConnection();

    try {
        await connection.ping();
        console.log('✅ MySQL connected successfully');
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    pool,
    test_connection
};