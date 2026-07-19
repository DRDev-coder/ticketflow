const Problem = require('../models/Problem');

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

module.exports = seedProblems;
