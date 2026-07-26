/**
 * config/gemini.js — Classify email content using Google Gemini API.
 *
 * Uses the Gemini REST API directly (no SDK — keeps dependencies minimal).
 * Model: gemini-2.0-flash (fast, free-tier, good for classification).
 *
 * Required env var: GEMINI_API_KEY
 * Get a fresh key at: https://aistudio.google.com/app/apikey
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Classify an email into one of the given problem categories (or "Others").
 *
 * @param {string}   subject      - Email subject line
 * @param {string}   bodyText     - Plain-text email body (truncated to 400 chars)
 * @param {string[]} problemNames - Array of active problem category names
 * @returns {Promise<string>}     - Matched problem name, or "Others"
 */
const classifyEmail = async (subject, bodyText, problemNames) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set — add it in Render Environment Variables');
  }

  // If no problem categories exist yet, everything goes to Others
  if (!problemNames || problemNames.length === 0) {
    return 'Others';
  }

  const categoriesList = problemNames.map(n => `- ${n}`).join('\n');
  const bodySnippet    = (bodyText || '').substring(0, 400);

  const prompt = `You are an email classifier for a support ticket system.

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

  const reqBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,       // deterministic — consistent classification
      maxOutputTokens: 50   // category name never needs more than this
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 429 = quota exhausted — surface clearly so it's easy to diagnose
    if (response.status === 429) {
      throw new Error(
        'Gemini API quota exhausted (429). Get a new API key at https://aistudio.google.com/app/apikey ' +
        'and update GEMINI_API_KEY in Render Environment Variables.'
      );
    }
    throw new Error(`Gemini API error ${response.status}: ${detail.substring(0, 200)}`);
  }

  const data = await response.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Others';

  // Exact match
  if (problemNames.includes(raw)) return raw;
  if (raw.toLowerCase() === 'others') return 'Others';

  // Case-insensitive fallback
  const fuzzy = problemNames.find(n => n.toLowerCase() === raw.toLowerCase());
  if (fuzzy) return fuzzy;

  // Gemini returned something unexpected
  console.warn(`Gemini returned unexpected category "${raw}" — defaulting to Others`);
  return 'Others';
};

module.exports = { classifyEmail };
