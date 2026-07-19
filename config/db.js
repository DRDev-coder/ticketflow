const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4 // Force IPv4 — helps on some networks where IPv6 DNS fails
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    console.error('   Make sure your IP is whitelisted in MongoDB Atlas Network Access.');
    console.error('   Retrying connection in 5 seconds...');
    // Retry once after 5 seconds instead of crashing
    setTimeout(async () => {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          family: 4
        });
        console.log('✅ MongoDB connected on retry');
      } catch (retryErr) {
        console.error(`❌ MongoDB retry failed: ${retryErr.message}`);
        console.error('   Server will continue running but DB operations will fail.');
        console.error('   Check: 1) Network/firewall  2) Atlas IP whitelist  3) Connection string');
      }
    }, 5000);
  }
};

module.exports = connectDB;
