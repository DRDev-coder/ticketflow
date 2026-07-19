const nodemailer = require('nodemailer');

// Create reusable transporter with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send a ticket notification email.
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.userName - Name of the user who raised the ticket
 * @param {string} options.userEmail - Email of the user who raised the ticket
 * @param {string} options.problemName - Problem category name
 * @param {string} options.description - Ticket description
 * @param {string} options.ticketId - Ticket ID
 * @param {Date} options.createdAt - Ticket creation timestamp
 * @param {string} [options.routedTo] - If set, renders a "Routed To" row in the email (used for admin copy)
 */
const sendTicketEmail = async ({ to, subject, userName, userEmail, problemName, description, ticketId, createdAt, routedTo }) => {
  const timestamp = new Date(createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F172A; color: #F8FAFC; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1E293B, #0F172A); padding: 24px 32px; border-bottom: 1px solid #334155;">
        <h1 style="margin: 0; font-size: 20px; color: #22C55E;">🎫 New Ticket Raised</h1>
      </div>
      <div style="padding: 24px 32px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px; width: 120px;">Ticket ID</td>
            <td style="padding: 8px 0; font-family: monospace; color: #22C55E; font-size: 13px;">${ticketId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Category</td>
            <td style="padding: 8px 0; font-size: 14px;">${problemName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Raised By</td>
            <td style="padding: 8px 0; font-size: 14px;">${userName} (${userEmail})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Time</td>
            <td style="padding: 8px 0; font-size: 14px;">${timestamp}</td>
          </tr>
          ${routedTo ? `
          <tr>
            <td style="padding: 8px 0; color: #94A3B8; font-size: 13px;">Routed To</td>
            <td style="padding: 8px 0; font-size: 14px; color: #60A5FA; font-family: monospace;">${routedTo}</td>
          </tr>` : ''}
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #1A1E2F; border-radius: 8px; border: 1px solid #334155;">
          <p style="margin: 0 0 4px; color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Description</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${description}</p>
        </div>
      </div>
      <div style="padding: 16px 32px; background: #1E293B; border-top: 1px solid #334155; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #64748B;">TicketFlow — Internal Ticket Routing System</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"TicketFlow" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Verify SMTP connection on startup.
 */
const verifyMailer = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email transporter ready (Gmail SMTP)');
  } catch (err) {
    console.error('❌ Email transporter error:', err.message);
    console.error('   Check SMTP_USER and SMTP_PASS in .env');
  }
};

module.exports = { sendTicketEmail, verifyMailer };
