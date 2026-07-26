const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendOtpEmail } = require('../config/mailer');
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

/** Generate a cryptographically random 6-digit OTP string. */
const generateOtp = () =>
  String(crypto.randomInt(100000, 999999)); // always 6 digits

/** OTP validity window: 10 minutes */
const OTP_TTL_MS = 10 * 60 * 1000;

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
 * Validate input, create an unverified account, send OTP to email.
 * Does NOT issue a session — user must verify OTP first, then log in.
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

    // 4. Duplicate email check
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }
      // Unverified duplicate: re-send a fresh OTP instead of rejecting
      const otp = generateOtp();
      existingUser.otp       = otp;
      existingUser.otpExpiry = new Date(Date.now() + OTP_TTL_MS);
      await existingUser.save();
      await sendOtpEmail(existingUser.email, otp);
      console.log(`📧 Resent OTP to existing unverified account: ${existingUser.email}`);
      return res.status(200).json({
        message: 'A new verification code has been sent to your email.',
        redirectTo: `/verify-otp?email=${encodeURIComponent(existingUser.email)}`
      });
    }

    // 5. Create unverified user
    const otp = generateOtp();
    const user = new User({
      name:          name.trim(),
      email:         email.toLowerCase().trim(),
      passwordHash:  password,       // hashed by pre-save hook
      isVerified:    false,
      otp,
      otpExpiry:     new Date(Date.now() + OTP_TTL_MS)
    });
    await user.save();

    // 6. Send OTP email (if this fails, delete the user so they can retry cleanly)
    try {
      await sendOtpEmail(user.email, otp);
      console.log(`📧 OTP sent to ${user.email}`);
    } catch (mailErr) {
      console.error('Failed to send OTP email — rolling back user creation:', mailErr.message);
      await User.deleteOne({ _id: user._id });
      return res.status(500).json({ error: 'Could not send verification email. Please try again.' });
    }

    res.status(201).json({
      message: 'Account created! Check your email for the 6-digit verification code.',
      redirectTo: `/verify-otp?email=${encodeURIComponent(user.email)}`
    });
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/auth/verify-otp
 * Validate the 6-digit OTP entered by the user.
 * Activates the account on success.
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and code are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'No account found for this email.' });
    }

    if (user.isVerified) {
      // Already verified — just let them log in
      return res.status(200).json({
        message: 'Email already verified. Please sign in.',
        redirectTo: '/login'
      });
    }

    // Check expiry first (give a clearer message)
    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      return res.status(400).json({
        error: 'This code has expired. Request a new one below.'
      });
    }

    // Check match
    if (user.otp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    // Activate account and clear OTP fields
    user.isVerified = true;
    user.otp        = null;
    user.otpExpiry  = null;
    await user.save();

    console.log(`✅ Email verified for ${user.email}`);

    res.status(200).json({
      message: 'Email verified! You can now sign in.',
      redirectTo: '/login?signup=success'
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/auth/resend-otp
 * Regenerate and resend the OTP for an unverified account.
 * We do NOT reveal whether the email exists (security), but practically
 * this is an internal system so we give clear feedback.
 */
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'No account found for this email.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'This account is already verified. Please sign in.' });
    }

    const otp = generateOtp();
    user.otp       = otp;
    user.otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    await user.save();

    await sendOtpEmail(user.email, otp);
    console.log(`📧 OTP resent to ${user.email}`);

    res.status(200).json({ message: 'A new code has been sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/auth/login
 * Log in an existing, verified user.
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

    // Block unverified accounts before checking the password
    if (!user.isVerified) {
      return res.status(403).json({
        error: 'Please verify your email first.',
        redirectTo: `/verify-otp?email=${encodeURIComponent(user.email)}`
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      id:    user._id,
      email: user.email,
      name:  user.name,
      role:  'user'
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
      id:    'admin',
      email: process.env.ADMIN_EMAIL,
      name:  'Admin',
      role:  'admin'
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

module.exports = { signup, verifyOtp, resendOtp, login, adminLogin, logout };
