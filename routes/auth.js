const express = require('express');
const router = express.Router();
const { signup, login, adminLogin, logout } = require('../controllers/authController');

// User auth
router.post('/api/auth/signup', signup);
router.post('/api/auth/login', login);
router.post('/api/auth/logout', logout);

// Admin auth
router.post('/api/admin/login', adminLogin);

module.exports = router;
