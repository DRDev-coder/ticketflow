# Internal Ticket / Issue Routing System

A small web app where registered users raise tickets against categorized "problems" (categories). Each ticket auto-emails the category's assigned inbox (+ a copy to admin). A Telegram bot handles daily check-ins with the admin for unresolved tickets.

## Current Phase: Phase 1 (Localhost)

Everything runs locally. The Telegram bot uses **polling mode** and the daily check-in is triggered manually (or via `node-cron`).

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env and fill in your real values
cp .env.example .env

# 3. Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

See `.env.example` for the full list of required variables. You'll need:
- A MongoDB Atlas connection string (free M0 cluster)
- A Gmail App Password (not your regular Gmail password)
- A Telegram Bot Token (from @BotFather) and your Chat ID (from @userinfobot)

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: EJS templates (server-rendered) + vanilla CSS/JS
- **Database**: MongoDB Atlas (via Mongoose)
- **Email**: Nodemailer + Gmail SMTP
- **Telegram**: node-telegram-bot-api (polling mode in Phase 1)
