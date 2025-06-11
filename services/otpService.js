// server/services/otpService.js
const otpGenerator = require('otp-generator');

// In-memory store for simplicity. For production, use Redis or database.
const otpStore = new Map(); // Map<email, { otp: string, createdAt: Date }>

const OTP_EXPIRY_TIME_MS = 5 * 60 * 1000; // 5 minutes

exports.generateOTP = () => {
    return otpGenerator.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false });
};

exports.storeOTP = (email, otp) => {
    otpStore.set(email, { otp, createdAt: new Date() });
    // Clean up expired OTPs (can be done with a cron job or on access)
    setTimeout(() => {
        if (otpStore.has(email) && otpStore.get(email).otp === otp) {
            otpStore.delete(email);
        }
    }, OTP_EXPIRY_TIME_MS);
};

exports.getStoredOTP = (email) => {
    const entry = otpStore.get(email);
    if (!entry) {
        return null;
    }
    const now = new Date();
    if (now.getTime() - entry.createdAt.getTime() > OTP_EXPIRY_TIME_MS) {
        otpStore.delete(email); // Expired
        return null;
    }
    return entry.otp;
};

exports.clearOTP = (email) => {
    otpStore.delete(email);
};