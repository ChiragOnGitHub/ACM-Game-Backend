// server/routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const { getGameState, getFolderDetails, submitAnswer,getAllFolders } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware'); // Middleware to protect routes

// We need to pass the `io` (Socket.IO) instance to the request object
// so that controllers can emit events.
// This requires a modification in server.js to attach `io` to `req`.
// For simplicity in this example, we'll assume `req.io` is available if needed.
// In a real app, you might use a closure or a separate module to access `io`.

// Middleware to attach socket.io to req (if you want to emit from controller)
// Add this in server.js before gameRoutes:
// app.use((req, res, next) => {
//    req.io = io;
//    next();
// });

// @route   GET /api/game/state
// @desc    Get current user's game state (unlocked folders, progress)
// @access  Private
router.get('/state', protect, getGameState);

// @route   GET /api/game/folder/:folderId
// @desc    Get details for a specific folder (riddle, dependencies)
// @access  Private
router.get('/folder/:folderId', protect, getFolderDetails);

// @route   POST /api/game/answer/:folderId
// @desc    Submit answer for a riddle in a folder
// @access  Private
router.post('/answer/:folderId', protect, submitAnswer);


router.get('/folders', protect, getAllFolders);
module.exports = router;