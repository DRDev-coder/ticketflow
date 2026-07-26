const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { SESSION_DURATION_MS, SESSION_DURATION_SECONDS } = require('../config/session');

/**
 * Password strength rules — single definition reused by the signup handler.
 * Each rule: { regex, label } where label describes what's missing.
 * These mirror the PASSWORD_RULES array in signup.ejs exactly.
 */
const PASSWORD_RULES = [
  { regex: /.{8,}/,        label: 'at least 8 characters' },
  { regex: /[A-Z]/,        label: 'at least one uppercase letter' },
  { regex: /[a-z]/,        label: 'at least one lowercase letter' },
  { regex: /[0-9]/,        label: 'at least one number' },
  { regex: /[^A-Za-z0-9]/, label: 'at least one special character (!@#$%^&* etc.)' }
];

/** Returns an array of failing rule labels, or [] if all rules pass. */
const getPasswordFailures = (password) =>
  PASSWORD_RULES.filter(r => !r.regex.test(password)).map(r => r.label);

/**
 * Cookie options shared by both user login and admin login.
 * maxAge is driven by the shared SESSION_DURATION_MS constant.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: SESSION_DURATION_MS
};

/**
 * Generate a JWT token for a given payload.
 * expiresIn is driven by the shared SESSION_DURATION_SECONDS constant
 * so the token's own expiry claim always matches the cookie maxAge.
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: SESSION_DURATION_SECONDS });
};

/**
 * POST /api/auth/signup
 * Register a new user account.
 * Does NOT issue a session — redirects to /login?signup=success instead.
 */
const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // 1. Presence check
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // 2. Confirm-password match (server re-validates — never trust client only)
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // 3. Password strength (names exactly which rules are failing)
    const failures = getPasswordFailures(password);
    if (failures.length > 0) {
      return res.status(400).json({
        error: 'Password must include ' + failures.join(', ') + '.'
      });
    }

    // 4. Duplicate email — checked explicitly before save so the error message
    //    is always friendly. The err.code === 11000 catch below is a safety net
    //    for the rare race-condition case.
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Create user (password is hashed via pre-save hook)
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: password
    });
    await user.save();

    // Do NOT issue a JWT or set a cookie — the user must log in explicitly.
    res.status(201).json({
      message: 'Account created successfully',
      redirectTo: '/login?signup=success'
    });
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/auth/login
 * Log in an existing user.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      id: user._id,
      email: user.email,
      name: user.name,
      role: 'user'
    });
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({
      message: 'Logged in successfully',
      user: user.toJSON()
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/admin/login
 * Admin login — checks against env vars, not the database.
 */
const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (
      username !== process.env.ADMIN_USERNAME ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const token = generateToken({
      id: 'admin',
      email: process.env.ADMIN_EMAIL,
      name: 'Admin',
      role: 'admin'
    });
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({ message: 'Admin logged in successfully' });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/auth/logout
 * Clear the JWT cookie.
 */
const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
};

module.exports = { signup, login, adminLogin, logout };
