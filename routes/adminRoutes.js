// server/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { addRiddle, addFolder, getAllUsers, toggleAdminStatus, getLeaderboard, getAllRiddles, getAllFolders } = require('../controllers/adminController');
const { protect, adminProtect } = require('../middleware/authMiddleware'); // Middleware to protect and ensure admin

// All admin routes should be protected and only accessible by admins
// router.use(protect, adminProtect); // Apply these middlewares to all routes below

// @route   POST /api/admin/riddles
// @desc    Add a new riddle
// @access  Private (Admin only)
router.post('/riddles', protect, adminProtect, addRiddle);

// @route   GET /api/admin/riddles
// @desc    Get all riddles
// @access  Private (Admin only)
router.get('/riddles', protect, adminProtect, getAllRiddles);


// @route   POST /api/admin/folders
// @desc    Add a new folder
// @access  Private (Admin only)
router.post('/folders', protect, adminProtect, addFolder);

// @route   GET /api/admin/folders
// @desc    Get all folders
// @access  Private (Admin only)
router.get('/folders', protect, adminProtect, getAllFolders);


// @route   GET /api/admin/users
// @desc    Get all non-admin users
// @access  Private (Admin only)
router.get('/users', protect, adminProtect, getAllUsers);

// @route   PUT /api/admin/users/:userId/toggle-admin
// @desc    Toggle a user's admin status
// @access  Private (Admin only)
router.put('/users/:userId/toggle-admin', protect, adminProtect, toggleAdminStatus);

// @route   GET /api/admin/leaderboard
// @desc    Get leaderboard data
// @access  Private (Admin only)
router.get('/leaderboard', protect, adminProtect, getLeaderboard);


// --- Additional Admin Routes (placeholder for future expansion) ---
// router.put('/riddles/:id', protect, adminProtect, updateRiddle);
// router.delete('/riddles/:id', protect, adminProtect, deleteRiddle);
// router.put('/folders/:id', protect, adminProtect, updateFolder);
// router.delete('/folders/:id', protect, adminProtect, deleteFolder);
// router.delete('/users/:userId', protect, adminProtect, deleteUser);

module.exports = router;