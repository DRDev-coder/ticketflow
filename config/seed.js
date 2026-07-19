const Problem = require('../models/Problem');
const Recipient = require('../models/Recipient');

/**
 * Seeds the database with initial problem categories (problem1–problem5).
 * Idempotent — skips if any problems already exist.
 */
const seedProblems = async () => {
  try {
    const count = await Problem.countDocuments();
    if (count > 0) {
      console.log(`📋 Problems already seeded (${count} found). Skipping.`);
      return;
    }

    const defaultEmail = process.env.ADMIN_EMAIL || 'darshan5154896@gmail.com';
    const problems = [
      { name: 'Login Issue', assignedEmail: defaultEmail },
      { name: 'Payment Problem', assignedEmail: defaultEmail },
      { name: 'Account Access', assignedEmail: defaultEmail },
      { name: 'Technical Bug', assignedEmail: defaultEmail },
      { name: 'General Inquiry', assignedEmail: defaultEmail }
    ];

    await Problem.insertMany(problems);
    console.log(`✅ Seeded ${problems.length} default problem categories.`);
  } catch (err) {
    console.error('❌ Error seeding problems:', err.message);
  }
};

/**
 * Seeds the known Recipient record for Sabhari R B.
 * Idempotent — upserts so it's safe to run multiple times.
 */
const seedRecipients = async () => {
  try {
    const result = await Recipient.findOneAndUpdate(
      { email: 'ashborn5307393@gmail.com' },
      {
        $setOnInsert: {
          email: 'ashborn5307393@gmail.com',
          telegramChatId: '8548817278',
          label: 'Sabhari R B'
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const action = result.createdAt &&
      (Date.now() - new Date(result.createdAt).getTime()) < 5000
        ? 'Seeded'
        : 'Already exists';
    console.log(`✅ Recipient "${result.label}" (${result.email}) — ${action}.`);
  } catch (err) {
    console.error('❌ Error seeding recipient:', err.message);
  }
};

/**
 * Run all seeders.
 */
const runSeeders = async () => {
  await seedProblems();
  await seedRecipients();
};

module.exports = runSeeders;
