/**
 * One-off migration script:
 * Updates ALL existing Problem documents to set assignedEmail = ashborn5307393@gmail.com
 *
 * Run with: node scripts/migrate-problem-emails.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ASSIGNED_EMAIL = 'ashborn5307393@gmail.com';

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    family: 4
  });
  console.log('✅ Connected to MongoDB');
};

const run = async () => {
  await connectDB();

  const result = await mongoose.connection.collection('problems').updateMany(
    {}, // match ALL problem documents
    { $set: { assignedEmail: ASSIGNED_EMAIL } }
  );

  console.log(`✅ Migration complete.`);
  console.log(`   Matched:  ${result.matchedCount} documents`);
  console.log(`   Modified: ${result.modifiedCount} documents`);
  console.log(`   All problems now route to: ${ASSIGNED_EMAIL}`);

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
  process.exit(0);
};

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
