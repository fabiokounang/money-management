const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true
};

if (process.env.NODE_ENV === 'production') {
    dbConfig.ssl = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    };
}

const pool = mysql.createPool(dbConfig);

async function testConnection() {
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.ping();
        console.log('MySQL connected successfully');
    } catch (error) {
        console.error('MySQL connection failed:', error.message);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    pool,
    testConnection,
    test_connection: testConnection
};