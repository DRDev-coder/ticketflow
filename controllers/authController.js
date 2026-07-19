const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * Generate a JWT token for a given payload.
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * POST /api/auth/signup
 * Register a new user account.
 */
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Create user (password is hashed via pre-save hook)
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: password
    });
    await user.save();

    // Issue JWT
    const token = generateToken({
      id: user._id,
      email: user.email,
      name: user.name,
      role: 'user'
    });
    res.cookie('token', token, COOKIE_OPTIONS);

    res.status(201).json({
      message: 'Account created successfully',
      user: user.toJSON()
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
