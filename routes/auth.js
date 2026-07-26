const express = require('express');
const router = express.Router();
const { signup, verifyOtp, resendOtp, login, adminLogin, logout } = require('../controllers/authController');

// User auth
router.post('/api/auth/signup', signup);
router.post('/api/auth/verify-otp', verifyOtp);
router.post('/api/auth/resend-otp', resendOtp);
router.post('/api/auth/login', login);
router.post('/api/auth/logout', logout);

// Admin auth
router.post('/api/admin/login', adminLogin);

module.exports = router;
