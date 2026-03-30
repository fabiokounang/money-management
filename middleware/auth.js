function auth(req, res, next) {
	if (!req.session || !req.session.user) {
	    req.flash('error_msg', 'Please login first');
	    return res.redirect('/login');
	}

	return next();
}

module.exports = auth;