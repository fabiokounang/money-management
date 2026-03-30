const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
require('dotenv').config();

const { test_connection } = require('./utils/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

app.use(flash());

app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.old = {};
    res.locals.current_path = req.path;
    res.locals.user = req.session.user || null;
    next();
});

const webRoutes = require('./routes/web');
app.use('/', webRoutes);

app.use((req, res) => {
    return res.status(404).render('error/404', {
        title: 'Page Not Found'
    });
});

app.use((error, req, res, next) => {
    console.error(error);

    return res.status(500).render('error/500', {
        title: 'Server Error'
    });
});

async function start_server() {
    try {
        await test_connection();

        app.listen(PORT, () => {
            console.log(`✅ Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

start_server();