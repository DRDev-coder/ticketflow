/**
 * config/gemini.js — Classify email content using Google Gemini API.
 *
 * Uses the Gemini REST API directly (no SDK — keeps dependencies minimal).
 * Model: gemini-1.5-flash (fast, cost-effective for classification tasks).
 *
 * Required env var: GEMINI_API_KEY
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/**
 * Classify an email into one of the given problem categories (or "Others").
 *
 * @param {string}   subject      - Email subject line
 * @param {string}   bodyText     - Plain-text email body (will be truncated to 400 chars)
 * @param {string[]} problemNames - Array of active problem category names
 * @returns {Promise<string>}     - Matched problem name exactly as in problemNames, or "Others"
 */
const classifyEmail = async (subject, bodyText, problemNames) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment');
  }

  // If no problems exist yet, everything goes to Others
  if (!problemNames || problemNames.length === 0) {
    return 'Others';
  }

  const categoriesList = problemNames.map(n => `- ${n}`).join('\n');
  const bodySnippet    = (bodyText || '').substring(0, 400);

  const prompt = `You are an email classifier for an internal support ticket system.

Active problem categories:
${categoriesList}

Email subject: ${subject || '(no subject)'}
Email body (first 400 characters): ${bodySnippet || '(empty)'}

Task: Classify this email into exactly one category from the list above.
If the email does not clearly belong to any category, reply with: Others

Rules:
- Reply with ONLY the exact category name from the list, or the word "Others"
- Do not add punctuation, explanation, or any other text
- Match case exactly as shown in the list`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,        // deterministic — we want consistent classification
      maxOutputTokens: 50    // category name should never need more than this
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Others';

  // Validate: returned value must exactly match one of our problem names, or "Others"
  if (problemNames.includes(raw)) return raw;
  if (raw.toLowerCase() === 'others') return 'Others';

  // Fuzzy fallback: case-insensitive match
  const fuzzy = problemNames.find(n => n.toLowerCase() === raw.toLowerCase());
  if (fuzzy) return fuzzy;

  // If Gemini returned something unexpected, log it and default to Others
  console.warn(`Gemini returned unexpected category "${raw}" — defaulting to Others`);
  return 'Others';
};

module.exports = { classifyEmail };
