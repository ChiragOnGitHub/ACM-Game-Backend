const User = require('../models/User');
const jwt = require('jsonwebtoken');
const otpService = require('../services/otpService');
const { sendEmail } = require('../services/emailService');
const GameState = require('../models/GameState'); // Assuming GameState exists

const generateToken = (id, isAdmin, username, email) => {
    return jwt.sign({ id, isAdmin, username, email }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.registerUser = async (req, res, next) => {
    const { username, email, rollNumber, password } = req.body;

    try {
        // Check for existing email
        const existingEmailUser = await User.findOne({ email });
        if (existingEmailUser) {
            return res.status(409).json({ message: 'User with this email already exists.', code: 'EMAIL_EXISTS' });
        }

        // Check for existing roll number
        const existingRollNumberUser = await User.findOne({ rollNumber });
        if (existingRollNumberUser) {
            return res.status(409).json({ message: 'User with this roll number already exists.', code: 'ROLL_NUMBER_EXISTS' });
        }
        
        // Ensure that a user with the same email or roll number doesn't exist but is NOT verified
        // (This is an edge case if a user registered but never verified)
        // However, given your current flow, the check above for existing users is sufficient.
        // If you want to handle unverified users trying to register again, you'd add more logic.

        const user = new User({ username, email, rollNumber, password });
        await user.save(); // This will hash the password via pre-save hook in User model

        // Send OTP
        const otp = otpService.generateOTP();
        otpService.storeOTP(email, otp); // Store OTP with email
        await sendEmail(email, 'Verify Your Riddle Game Account', `Your OTP for Riddle Game is: ${otp}`);

        res.status(201).json({
            message: 'User registered successfully. OTP sent to your email for verification.',
            userId: user._id,
            email: user.email,
        });

    } catch (error) {
        console.error('Error during user registration (authController.js):', error);
        // More specific error handling could be added here, e.g., if sendEmail fails
        res.status(500).json({ message: 'Server error during registration. Please try again.' });
    }
};

// @desc    Verify OTP and activate user
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found.', code: 'USER_NOT_FOUND' });
        }

        if (user.isVerified) {
            // If already verified, no need to verify again. Just let them know.
            return res.status(200).json({ message: 'Account already verified. Please proceed to login.', alreadyVerified: true });
        }

        const storedOtp = otpService.getStoredOTP(email);
        if (!storedOtp || storedOtp !== otp) {
            return res.status(400).json({ message: 'Invalid or expired OTP. Please try again or resend.', code: 'INVALID_OR_EXPIRED_OTP' });
        }

        user.isVerified = true;
        await user.save();
        otpService.clearOTP(email); // Clear OTP after successful verification

        // Initialize game state for the user if it doesn't already exist
        let gameState = await GameState.findOne({ user: user._id });
        if (!gameState) {
             await GameState.create({ user: user._id });
        }
       
        // Important: As per your requirement, redirect to login, not automatically log in here.
        res.status(200).json({
            message: 'Account verified successfully! You can now log in.',
            // Do NOT send token here, as per requirement to redirect to login
            // token: generateToken(user._id, user.isAdmin),
            // user: { ... }
        });

    } catch (error) {
        console.error('Error during OTP verification (authController.js):', error);
        res.status(500).json({ message: 'Server error during OTP verification. Please try again.' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    try {
        // 1. Check if user exists by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found with this email.', code: 'USER_NOT_FOUND' });
        }

        // 2. Check password
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials. Password does not match.', code: 'INVALID_CREDENTIALS' });
        }

        // 3. Check if account is verified
        if (!user.isVerified) {
            // Re-send OTP for verification if account is not verified
            const otp = otpService.generateOTP();
            otpService.storeOTP(email, otp);
            await sendEmail(email, 'Verify Your Riddle Game Account', `Your OTP is: ${otp}`);
            return res.status(403).json({
                message: 'Your account is not verified. A new OTP has been sent to your email.',
                code: 'ACCOUNT_NOT_VERIFIED',
                email: user.email, // Send email back for front-end redirection
            });
        }
        let gameState = await GameState.findOne({ user: user._id });
        if (!gameState) {
             await GameState.create({ user: user._id });
        }

        // If all checks pass, generate and send token
        res.status(200).json({
            message: 'Login successful!',
            token: generateToken(user._id, user.isAdmin, user.username, user.email), // Include username and email in token payload
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                rollNumber: user.rollNumber,
                isAdmin: user.isAdmin,
                isVerified: user.isVerified // Ensure isVerified is returned
            },
        });

    } catch (error) {
        console.error('Error during user login (authController.js):', error);
        res.status(500).json({ message: 'Server error during login. Please try again.' });
    }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found with this email.', code: 'USER_NOT_FOUND' });
        }
        
        if (user.isVerified) {
            return res.status(400).json({ message: 'Account is already verified. No need to resend OTP.', code: 'ALREADY_VERIFIED' });
        }

        const otp = otpService.generateOTP();
        otpService.storeOTP(email, otp);
        await sendEmail(email, 'Your OTP for Riddle Game', `Your OTP is: ${otp}`);

        res.status(200).json({ message: 'New OTP sent to your email.' });

    } catch (error) {
        console.error('Error during resend OTP (authController.js):', error);
        res.status(500).json({ message: 'Server error during OTP resend. Please try again.' });
    }
};