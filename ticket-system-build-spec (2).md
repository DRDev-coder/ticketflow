# Build Spec: Internal Ticket / Issue Routing System with Telegram Follow-up

## Instructions for the Agent — Read This First

There is no repository or project set up yet — you're starting from a completely empty folder. Before writing any application code, do the following, in order:

1. Initialize a git repository (`git init`).
2. Initialize a Node.js project (`npm init -y`), then fill in a sensible `"name"` and `"description"` in `package.json`.
3. Create a `.gitignore` containing at least: `node_modules/`, `.env`, `.DS_Store`.
4. Create a `.env.example` file listing every variable name from **§8 Environment Variables** below (names only, placeholder values like `your_value_here` — never real secrets), so it's clear what needs to be filled in.
5. Create a real `.env` file (git-ignored, not committed). I will provide the actual values (MongoDB URI, Gmail App Password, Telegram bot token, etc.) myself — if one is missing when you need it, ask me for it rather than inventing or skipping it.
6. Create a short `README.md`: what the project is, how to run it locally (`npm install`, then the dev-start command), and a note that we're currently on **Phase 1 (localhost)** per §0.1 below.
7. Set up a simple Express project skeleton (e.g. `/models`, `/routes`, `/controllers`, `/public` or similar — keep the folder structure simple, this is a small app).

Once that scaffolding is done, build strictly in the order given in **§10 Build Order → Phase 1**, one milestone at a time. After finishing each milestone, stop, tell me how to test it locally, and wait for me to confirm before starting the next one. Do **not** begin any Phase 2 (deployment) step until I explicitly ask for it.

If anything below is ambiguous, or you're about to make a decision with security or data implications (auth approach, password rules, how secrets are stored, etc.), ask me instead of guessing silently.

---

## 0. One-line summary
A small web app where registered users raise tickets against a fixed list of "problems" (categories). Each ticket auto-emails the category's assigned inbox (+ a copy to admin). At a scheduled time each day, a Telegram bot asks the admin, per unresolved ticket, whether it's fixed (Yes/No buttons); "No" prompts for a reason. Admin has a hardcoded login and can create new problem categories, each with its own destination email.

---

## 0.1 Development Phases — Build Locally First, Deploy Later

This project should be built and fully tested on **localhost** first, then deployed. Almost everything behaves identically in both phases — same database (MongoDB Atlas works from a local machine exactly as it will from Render), same email sending, same app logic. Only two things genuinely differ, so build them as a config switch from day one rather than hardcoding one mode and rewriting later:

| Concern | Phase 1: Localhost | Phase 2: Deployed |
|---|---|---|
| Telegram bot | **Polling mode** — the bot repeatedly asks Telegram's servers "any new messages?". No public URL needed, works immediately on `localhost`. | **Webhook mode** — Telegram calls your public `/api/telegram/webhook` URL directly. Needed in production because it's what wakes a sleeping Render instance back up; polling can't wake up a process that isn't running. |
| Daily check-in trigger | Just call `/api/cron/daily-checkin` yourself (browser, curl, or Postman) whenever you want to test it, or add a simple in-process `node-cron` timer since your dev server stays running while you work. | An external free scheduler (cron-job.org) hits the same `/api/cron/daily-checkin` endpoint once a day, because a sleeping free-tier instance can't run its own in-process timer reliably. |

Control the Telegram mode with an env var, e.g. `TELEGRAM_MODE=polling` (local) vs `TELEGRAM_MODE=webhook` (deployed), so switching later is a config change, not new code.

**Phase 1 (localhost) needs only:** Node.js installed on your machine, a MongoDB Atlas account (free, works over the internet from localhost too — no local Mongo install needed, and no later data migration), a Gmail App Password, and a Telegram bot token + your chat ID.

**Phase 2 (deploy) additionally needs:** a GitHub account, a Render account, and a cron-job.org account — none of which you need to touch yet.

---

## 1. Roles

### 1.1 User
- Can sign up (email + password) and log in.
- Can raise a ticket: pick a problem/category from a dropdown, add a description, submit.
- Can view their own past tickets and current status (Open / Resolved / Not Resolved).

### 1.2 Admin
- Single hardcoded account, **no database record, no signup flow**:
  - username: `admin`
  - password: `admin@123`
  - (Load these from environment variables `ADMIN_USERNAME` / `ADMIN_PASSWORD` rather than hardcoding literally in source, so they can be changed without a code edit.)
- Logs in via a separate `/admin/login` page (no signup option shown to admin).
- Sees a dashboard of **all** tickets from all users, with filters by status/problem.
- Manages "Problems" (see §3): create new ones, assign a destination email to each.
- Receives Telegram check-in prompts (see §4) and can also manually mark a ticket resolved from the dashboard.

---

## 2. Data Models

### User
| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| name | string | |
| email | string | unique, used for login |
| passwordHash | string | bcrypt |
| createdAt | datetime | |

### Problem (category)
| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| name | string | e.g. "problem1", or a real label like "Login Issue" |
| assignedEmail | string | destination inbox for this category |
| isActive | boolean | soft-disable instead of delete |
| createdAt | datetime | |

Seed data on first run: problem1..problem5, all with `assignedEmail = darshan5154896@gmail.com` (see §8 for why they're all the same right now).

### Ticket
| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| userId | ObjectId ref User | |
| problemId | ObjectId ref Problem | |
| description | string | free text from user |
| status | enum | `open` \| `resolved` \| `not_resolved` |
| assignedEmailAtCreation | string | snapshot of the email it was sent to, in case the Problem's email changes later |
| reasonLog | array of {reason, note, at} | appended each time admin replies "No" + gives a reason |
| createdAt | datetime | |
| resolvedAt | datetime, nullable | |
| lastCheckInAt | datetime, nullable | last time the Telegram bot asked about this ticket |

---

## 3. Feature: Problem (category) Management — Admin only

- Admin dashboard page listing all Problems: name, assigned email, active/inactive, ticket count.
- "Add Problem" form: name (text) + assigned email (text input, validated as an email). On save, becomes immediately selectable by users raising new tickets.
- Edit existing Problem: change name, change assigned email, toggle active/inactive.
- Do NOT hardcode the 5 problems in frontend code — they must come from the database, so admin-created ones (problem6, problem7...) behave identically to the seeded ones.

---

## 4. Feature: Ticket Creation + Email Routing — User-facing

1. Logged-in user opens "Raise a Ticket" form: dropdown of active Problems, description textarea, submit button.
2. On submit:
   - Create Ticket document, status = `open`.
   - Send an email to `problem.assignedEmail` with: user's name/email, problem name, description, timestamp, ticket ID.
   - Send a copy (CC or a near-identical second email) to `ADMIN_EMAIL` env variable. (Right now `ADMIN_EMAIL` and every `problem.assignedEmail` are the same address, `darshan5154896@gmail.com` — but keep them as two separate config values / fields so that when you later change the 5 problems to point at 3 different real inboxes, the admin-copy still works independently.)
   - Show the user a confirmation with their ticket ID.
3. Use Nodemailer with Gmail SMTP (App Password) for sending — see §8 for credentials needed.

---

## 5. Feature: Daily Telegram Check-In

### Behaviour
- Once per day, at a configurable time (default suggestion: **9:00 PM IST**, configurable via env var `DAILY_CHECKIN_HOUR_UTC` or similar), the system reviews all tickets with `status = open` (optionally: only ones created that day, or all still-open regardless of age — default: **all still-open tickets**, so nothing falls through the cracks).
- For each open ticket, the bot sends the admin a Telegram message like:

  > **Ticket #A1B2** — Login Issue
  > Raised by: jane@example.com at 2:14 PM
  > Description: "Can't reset my password..."
  >
  > Is this resolved?
  > [ Yes ]  [ No ]   ← Telegram inline keyboard buttons, not free text

  Use Telegram's **inline keyboard buttons** (`callback_query`) with `callback_data` encoding the ticket ID (e.g. `resolve_yes_<ticketId>` / `resolve_no_<ticketId>`) — this avoids ambiguity from free-text replies when multiple tickets are pending at once.
- If admin taps **Yes** → update that ticket: `status = resolved`, `resolvedAt = now`. Bot edits the message to show "✅ Marked resolved."
- If admin taps **No** → bot replies "What's the reason?" and waits for the **next plain text message** from the admin's chat, treating it as the reason for *that specific ticket* (track this with a small "pending reason for ticket X" state, keyed by chat ID — in-memory is fine for a single admin, or store on the Ticket itself as `awaitingReasonFor: true`). Once the reason arrives: append `{reason: 'not_resolved', note: <text>, at: now}` to `reasonLog`, set `status = not_resolved`, set `lastCheckInAt = now`. The ticket will be asked about again on the next daily run if it's not later marked resolved (either by admin dashboard or a future check-in).
- Trigger mechanism: always expose a protected endpoint, e.g. `POST /api/cron/daily-checkin`, guarded by a shared secret sent as a header (`X-Cron-Secret`) matching env var `CRON_SECRET`. This is the single source of truth for "run the check-in logic," regardless of what triggers it.
  - **Locally**: trigger it by hand (curl/Postman/browser) while testing, or add a basic `node-cron` timer that calls the same internal function — fine because your dev server stays running.
  - **Once deployed**: free hosting (Render free tier) puts services to sleep after inactivity, so an in-process timer alone would stop firing while asleep. Use an external free scheduler (cron-job.org) to call the endpoint once a day at the chosen time instead — this both triggers the check-in logic and wakes the sleeping service.
- Telegram bot mode, controlled by `TELEGRAM_MODE` env var:
  - **`polling`** (use this locally): the bot repeatedly asks Telegram's servers for new updates. No public URL required — works immediately on `localhost`.
  - **`webhook`** (switch to this after deploying): Telegram calls your `/api/telegram/webhook` endpoint directly when the admin taps a button or sends a message. Needed in production because it works even on a service that's asleep between requests — the incoming call itself wakes it (Telegram will retry if the first attempt times out during cold start).

---

## 6. Auth

- **User**: signup (name, email, password) and login. Hash passwords with bcrypt. Use either JWT (stored in an httpOnly cookie) or `express-session` — either is fine; pick one and be consistent.
- **Admin**: single login form, checks submitted username/password against `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (no DB lookup). On success, issue a session/JWT with a role flag `role: 'admin'` so admin-only routes can be protected the same way as user routes.
- Protect all admin routes/pages (Problem management, full ticket dashboard) so only `role: 'admin'` sessions can access them.

---

## 7. Suggested Tech Stack (kept deliberately simple, 100% free tiers)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | one language across the stack, huge free-tier/tutorial support |
| Frontend | Plain HTML/CSS/JS (or a couple of EJS/Handlebars templates) served by the same Express app | avoids needing a second hosting service just for the frontend; keeps this a genuinely "small website" |
| Database | MongoDB Atlas free M0 cluster (via Mongoose) | free forever, no card, no time limit (unlike Render's own free Postgres, which self-deletes after 30 days) |
| Email | Nodemailer + Gmail SMTP with an App Password | free, uses the Gmail account you already have |
| Telegram | Telegram Bot API via `node-telegram-bot-api` (or raw `fetch`/`axios` calls), webhook mode | free, no rate-limit concerns at this scale |
| Hosting *(Phase 2 only)* | Render.com free Web Service | no card required; note it sleeps after 15 min idle (30-60s cold start on next request) — acceptable for an internal small tool. Not needed while developing on localhost. |
| Daily scheduler trigger *(Phase 2 only)* | cron-job.org free account, hitting a secret-protected endpoint | works around Render's sleep behavior; free, no card. Locally, just call the endpoint manually or use an in-process `node-cron`. |
| Secrets | `.env` file locally, Render's "Environment" tab in production | never commit `.env` to git |

(If you'd rather not touch Node.js, Python/Flask + APScheduler-free-alternative works equivalently — but the plan above assumes Node/Express since it's the most common free-tier-friendly path.)

---

## 8. Environment Variables Needed

```
MONGODB_URI=              # from MongoDB Atlas
JWT_SECRET=               # any long random string, generate yourself
SESSION_SECRET=           # if using express-session instead of/alongside JWT

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin@123
ADMIN_EMAIL=darshan5154896@gmail.com   # copy of every ticket goes here

SMTP_USER=darshan5154896@gmail.com
SMTP_PASS=                # Gmail App Password (16 chars, NOT your Gmail login password)

TELEGRAM_BOT_TOKEN=       # from @BotFather
TELEGRAM_ADMIN_CHAT_ID=   # your personal chat id, from @userinfobot
TELEGRAM_MODE=polling     # "polling" while on localhost; switch to "webhook" after deploying

CRON_SECRET=              # any random string, used to protect /api/cron/daily-checkin
DAILY_CHECKIN_HOUR_LOCAL= # e.g. "21:00" IST — informational; actual trigger comes from cron-job.org (Phase 2) or node-cron/manual call (Phase 1)

PORT=3000                 # local dev port; Render sets its own PORT automatically in Phase 2
```

**Phase 1 (localhost) note:** every variable above except none — you'll want them all filled in even locally, since email and Telegram both need real credentials to test end-to-end. Only `TELEGRAM_MODE` and how the cron endpoint gets triggered differ between phases.

Note: right now every Problem's `assignedEmail` **and** `ADMIN_EMAIL` are the same address (`darshan5154896@gmail.com`). Build the Problem model and the admin-copy logic as genuinely independent fields anyway (per §3 and §4), so that later, swapping in 3 real distinct addresses is just an admin-panel edit, not a code change.

---

## 9. Suggested API Endpoints

```
POST   /api/auth/signup              (user)
POST   /api/auth/login               (user)
POST   /api/admin/login              (admin, checks env vars)
POST   /api/auth/logout

GET    /api/problems                 (active problems, for the ticket-raising dropdown)
POST   /api/tickets                  (user raises a ticket)
GET    /api/tickets/mine             (user's own tickets)

GET    /api/admin/tickets            (admin: all tickets, filterable)
PATCH  /api/admin/tickets/:id        (admin: manually mark resolved/not_resolved)

GET    /api/admin/problems           (admin: list problems)
POST   /api/admin/problems           (admin: create new problem incl. assignedEmail)
PATCH  /api/admin/problems/:id       (admin: edit name/email/active)

POST   /api/telegram/webhook         (Telegram calls this on button taps / messages)
POST   /api/cron/daily-checkin       (called by cron-job.org, guarded by X-Cron-Secret header)
```

---

## 10. Build Order (suggested milestones for the agent)

**Phase 1 — all of this runs and is fully testable on localhost:**

1. Scaffold Express app + MongoDB Atlas connection + User model + signup/login (JWT or session).
2. Problem model + seed script (problem1-5, all → darshan5154896@gmail.com) + admin-only CRUD endpoints/pages for Problems.
3. Ticket model + "raise a ticket" form/endpoint + Nodemailer sending to `assignedEmail` and `ADMIN_EMAIL`. Test by actually raising a ticket locally and checking the inbox.
4. User dashboard (their tickets) + Admin dashboard (all tickets, manual status change).
5. Telegram bot in **polling mode** (`TELEGRAM_MODE=polling`): daily-checkin endpoint, inline Yes/No buttons, reason-capture flow. Test by manually calling `/api/cron/daily-checkin` and confirming the Telegram messages arrive and button taps update the ticket correctly.

**Phase 2 — only once everything above works locally:**

6. Push code to GitHub, create a Render free Web Service, add all env vars there, deploy.
7. Switch `TELEGRAM_MODE` to `webhook` and register the webhook URL with Telegram (pointing at the deployed Render URL).
8. Set up cron-job.org to hit `/api/cron/daily-checkin` daily, with the `X-Cron-Secret` header.
9. Do one full end-to-end test against the live deployment: raise a ticket, confirm emails arrive, confirm the Telegram check-in fires at the scheduled time.

---

## 11. Assumptions Made (review before handing this to an agent)

- **Frontend kept plain/simple** (server-rendered or vanilla JS) rather than a full React app, to match "small website" — change this section if you'd prefer React.
- **Daily check-in reviews *all* currently-open tickets**, not just ones raised that specific day — change if you only want same-day tickets checked.
- **Daily check-in time defaults to ~9 PM local** — adjust to whatever time you actually want "end of day" to mean.
- **Ticket description is a single free-text field** (no file attachments) — attachments would need a free file-storage add-on (e.g. Cloudinary free tier) if you want that later.
- **Users must be logged in to raise a ticket** (no anonymous/guest submissions) — say so if you want guest ticket-raising too.
- Node.js/Express + MongoDB was picked as the stack since none was specified; swap freely if you or the agent prefers Python.
