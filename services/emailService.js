// server/services/emailService.js
// Use Nodemailer or similar for sending emails
const nodemailer = require('nodemailer');

// Configure your email transporter (e.g., Gmail, SendGrid, Mailgun)
const transporter = nodemailer.createTransport({
    service: 'gmail', // Example, replace with your service
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

exports.sendEmail = async (to, subject, text, html) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            text,
            html,
        };
        await transporter.sendMail(mailOptions);
        // console.log('Email sent successfully to ' + to);
    } catch (error) {
        console.error('Error sending email:', error);
        // In production, handle this gracefully, log, or retry
    }
};