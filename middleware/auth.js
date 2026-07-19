const jwt = require('jsonwebtoken');

/**
 * Extracts and verifies the JWT from the httpOnly cookie.
 * Attaches decoded payload to req.user if valid.
 */
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    req.user = null;
    res.clearCookie('token');
    next();
  }
};

/**
 * Requires a logged-in user (any role).
 * Redirects to login page if not authenticated.
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
};

/**
 * Requires admin role.
 * Redirects to admin login page if not authenticated as admin.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return res.redirect('/admin/login');
  }
  next();
};

module.exports = { verifyToken, requireAuth, requireAdmin };
