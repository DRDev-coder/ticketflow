require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const connectDB = require('./config/db');
const seedProblems = require('./config/seed');
const { verifyMailer } = require('./config/mailer');
const { initTelegramBot } = require('./config/telegram');
const { verifyToken, requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- View Engine (EJS with Layouts) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// --- Attach user to all views ---
app.use(verifyToken);
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// --- API Routes ---
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const ticketRoutes = require('./routes/tickets');
const cronRoutes = require('./routes/cron');
const telegramRoutes = require('./routes/telegram');
app.use(authRoutes);
app.use(adminRoutes);
app.use(ticketRoutes);
app.use(cronRoutes);
app.use(telegramRoutes);

// --- Page Routes ---

// Public pages
app.get('/', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/my-tickets');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.user && req.user.role !== 'admin') return res.redirect('/my-tickets');
  res.render('login', { title: 'Login', signupSuccess: req.query.signup === 'success' });
});

app.get('/signup', (req, res) => {
  if (req.user && req.user.role !== 'admin') return res.redirect('/my-tickets');
  res.render('signup', { title: 'Sign Up' });
});

app.get('/verify-otp', (req, res) => {
  // If already logged in, no need to verify
  if (req.user && req.user.role !== 'admin') return res.redirect('/my-tickets');
  const email = req.query.email || '';
  res.render('verify-otp', { title: 'Verify Email', email });
});

app.get('/admin/login', (req, res) => {
  if (req.user && req.user.role === 'admin') return res.redirect('/admin/dashboard');
  res.render('admin-login', { title: 'Admin Login' });
});

// Protected user pages
app.get('/my-tickets', requireAuth, (req, res) => {
  res.render('my-tickets', { title: 'My Tickets' });
});

app.get('/raise-ticket', requireAuth, (req, res) => {
  res.render('raise-ticket', { title: 'Raise a Ticket' });
});

// Protected admin pages
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.render('admin-dashboard', { title: 'Admin Dashboard' });
});

app.get('/admin/problems', requireAdmin, (req, res) => {
  res.render('admin-problems', { title: 'Problem Management' });
});

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).render('login', { title: 'Page Not Found' });
});

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start Server ---
const startServer = async () => {
  // Connect to DB, then seed, then verify email, then start Telegram bot
  await connectDB();
  await seedProblems();
  await verifyMailer();
  initTelegramBot();

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Telegram mode: ${process.env.TELEGRAM_MODE || 'polling'}\n`);
  });
};

startServer();
