/**
 * Shared session duration constant.
 *
 * Change SESSION_DURATION_HOURS here — it automatically applies to:
 *   • JWT expiresIn claim  (authController.js)
 *   • Cookie maxAge        (authController.js)
 *   • Both user login AND admin login
 *
 * For quick expiry testing, temporarily set this to something small
 * (e.g. 0.01 ≈ 36 seconds), verify redirect behaviour, then restore to 5.
 */
const SESSION_DURATION_HOURS = 5;

/** Milliseconds — used for cookie maxAge */
const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;

/** Seconds — used for JWT expiresIn */
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;

module.exports = { SESSION_DURATION_HOURS, SESSION_DURATION_MS, SESSION_DURATION_SECONDS };
