// server/controllers/adminController.js
const Folder = require('../models/Folder');
const Riddle = require('../models/Riddle');
const User = require('../models/User');
const GameState = require('../models/GameState');
const io = require('socket.io'); // If you need to emit from here, pass io instance

// @desc    Add a new riddle
// @route   POST /api/admin/riddles
// @access  Private (Admin)
exports.addRiddle = async (req, res, next) => {
    const { question, image, answer, answerCaseSensitive, nextRiddle, unlocksFolder } = req.body;
    try {
        const riddle = new Riddle({
            question,
            image,
            answer,
            answerCaseSensitive,
            nextRiddle,
            unlocksFolder,
        });
        await riddle.save();
        res.status(201).json({ message: 'Riddle added successfully', riddle });
    } catch (error) {
        next(error);
    }
};

// @desc    Add a new folder
// @route   POST /api/admin/folders
// @access  Private (Admin)
exports.addFolder = async (req, res, next) => {
    const { name, order, riddleId, dependencies } = req.body;
    try {
        // Validate riddleId and dependencies exist
        const riddle = await Riddle.findById(riddleId);
        if (!riddle) {
            return res.status(400).json({ message: 'Riddle not found for this folder.' });
        }
        if (dependencies && dependencies.length > 0) {
            const existingFolders = await Folder.find({ _id: { $in: dependencies } });
            if (existingFolders.length !== dependencies.length) {
                return res.status(400).json({ message: 'One or more dependency folders not found.' });
            }
        }

        const folder = new Folder({
            name,
            order,
            riddle: riddleId,
            dependencies: dependencies || [],
        });
        await folder.save();
        res.status(201).json({ message: 'Folder added successfully', folder });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all users (for management)
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find({ isAdmin: false }).select('-password'); // Exclude admins, sensitive data
        res.status(200).json(users);
    } catch (error) {
        next(error);
    }
};

// @desc    Toggle user admin status
// @route   PUT /api/admin/users/:userId/toggle-admin
// @access  Private (Admin)
exports.toggleAdminStatus = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        user.isAdmin = !user.isAdmin;
        await user.save();
        res.status(200).json({ message: `User ${user.username} admin status toggled to ${user.isAdmin}` });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Leaderboard Data
// @route   GET /api/admin/leaderboard
// @access  Private (Admin only)
exports.getLeaderboard = async (req, res, next) => {
    try {
        // Fetch all game states and populate user data (username, rollNumber)
        // We're also using the 'lastActivity' from the User model for additional tie-breaking,
        // although 'lastFolderUnlockedAt' from GameState is generally preferred for game progress.
        const gameStates = await GameState.find({})
            .populate('user', 'username rollNumber lastActivity'); // Populate specific user fields

        // Calculate scores and prepare leaderboard entries
        const leaderboard = gameStates
            .map(gameState => {
                // Ensure user data is populated and not null
                if (!gameState.user) {
                    console.warn(`GameState found without associated user: ${gameState._id}. Skipping.`);
                    return null; // Skip this entry if user data is missing
                }

                const unlockedFoldersCount = gameState.unlockedFolders.length;

                // The primary score is simply the number of unlocked folders.
                const score = unlockedFoldersCount;

                return {
                    userId: gameState.user._id,
                    username: gameState.user.username,
                    rollNumber: gameState.user.rollNumber,
                    unlockedFolders: unlockedFoldersCount,
                    score: score, // This is the primary sorting key
                    // Use lastFolderUnlockedAt from GameState for tie-breaking for game completion
                    lastCompletionTime: gameState.lastFolderUnlockedAt,
                    // Fallback to user's lastActivity if lastFolderUnlockedAt isn't set,
                    // though lastFolderUnlockedAt is more accurate for game progress.
                    userLastActivity: gameState.user.lastActivity
                };
            })
            .filter(entry => entry !== null) // Remove entries where user was not found
            .sort((a, b) => {
                // Primary sort: **Higher score (more unlocked folders) comes first**
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                // Secondary sort (tie-breaker): **Earlier lastCompletionTime (lower timestamp) comes first**
                // This determines who "opened all of them at same time" (or earlier).
                // Handle cases where 'lastCompletionTime' might be null (e.g., user hasn't completed any folder yet).
                if (a.lastCompletionTime === null && b.lastCompletionTime !== null) return 1; // Put nulls at the end of ties
                if (b.lastCompletionTime === null && a.lastCompletionTime !== null) return -1; // Put nulls at the end of ties
                if (a.lastCompletionTime !== null && b.lastCompletionTime !== null) {
                    return a.lastCompletionTime.getTime() - b.lastCompletionTime.getTime();
                }

                // Tertiary sort (fallback tie-breaker): Use user's lastActivity if both lastCompletionTime are null
                // Or if for some reason lastCompletionTime is not granular enough.
                if (a.userLastActivity === null && b.userLastActivity !== null) return 1;
                if (b.userLastActivity === null && a.userLastActivity !== null) return -1;
                if (a.userLastActivity !== null && b.userLastActivity !== null) {
                    return a.userLastActivity.getTime() - b.userLastActivity.getTime();
                }

                return 0; // No change in order if all tie-breakers are equal
            });

        res.status(200).json(leaderboard);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        // Pass the error to the Express error handling middleware for consistent error handling
        next(error);
    }
};

// @desc    Get all riddles
// @route   GET /api/admin/riddles
// @access  Private (Admin)
exports.getAllRiddles = async (req, res, next) => {
    try {
        const riddles = await Riddle.find();
        res.status(200).json(riddles);
    } catch (error) {
        next(error);
    }
};

// @desc    Get all folders
// @route   GET /api/admin/folders
// @access  Private (Admin)
exports.getAllFolders = async (req, res, next) => {
    try {
        const folders = await Folder.find().populate('riddle', 'question').populate('dependencies', 'name');
        res.status(200).json(folders);
    } catch (error) {
        next(error);
    }
};

// ... (add update/delete riddle/folder/user endpoints)