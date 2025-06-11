// server/routes/otpRoutes.js
const express = require('express');
const router = express.Router();
const { resendOtp } = require('../controllers/authController'); // Re-use the resendOtp from authController

// @route   POST /api/otp/resend
// @desc    Request a new OTP for a given email
// @access  Public
router.post('/resend', resendOtp);

module.exports = router;