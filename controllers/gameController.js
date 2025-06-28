// server/controllers/gameController.js
const GameState = require('../models/GameState');
const Folder = require('../models/Folder');
const Riddle = require('../models/Riddle');
const User = require('../models/User'); // To update last activity


// @desc    Get user's game state (unlocked folders)
// @route   GET /api/game/state
// @access  Private
exports.getGameState = async (req, res, next) => {
    try {
        const gameState = await GameState.findOne({ user: req.user.id })
            .populate('unlockedFolders.folderId', 'name order')
            .populate('unlockedFolders.currentRiddleAttempt', 'question image nextRiddle');

        if (!gameState) {
            // If no game state, create one. This is crucial for new users.
            // But if you handle this on signup, this should rarely be hit.
            // For now, let's assume it should exist for a logged-in user.
            return res.status(404).json({ message: 'Game state not found for user. Please try logging out and in again.' });
        }

        res.status(200).json(gameState);
    } catch (error) {
        console.error("Error in getGameState:", error);
        // Generic 500 for unexpected errors during state retrieval
        return res.status(500).json({ message: 'Failed to load game state due to a server error. Please try again.' });
        
    }
};

// @desc    Get folder details (riddle, dependencies)
// @route   GET /api/game/folder/:folderId
// @access  Private
exports.getFolderDetails = async (req, res, next) => {
    try {
        const folder = await Folder.findById(req.params.folderId).populate('riddle', 'question image');

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found.' });
        }
        if (!folder.riddle) {
            // This is a configuration error on the server side
            return res.status(500).json({ message: 'This folder is misconfigured (missing riddle). Please contact support.' });
        }

        const gameState = await GameState.findOne({ user: req.user.id });
        if (!gameState) {
            return res.status(404).json({ message: 'Game state not found for user. Cannot check folder access.' });
        }

        const dependenciesMet = (folder.dependencies || []).every(depId =>
            gameState.unlockedFolders.some(uf => uf.folderId.equals(depId))
        );

        if (!dependenciesMet) {
            return res.status(403).json({ message: 'This folder is locked! Unlock its prerequisites first.' });
        }

        const unlockedFolderEntry = gameState.unlockedFolders.find(uf => uf.folderId.equals(folder._id));
        const isUnlocked = !!unlockedFolderEntry;

        let riddleToSend = null;
        let currentRiddleId;

        if (unlockedFolderEntry && unlockedFolderEntry.currentRiddleAttempt) {
            currentRiddleId = unlockedFolderEntry.currentRiddleAttempt;
        } else {
            currentRiddleId = folder.riddle._id;
        }

        riddleToSend = await Riddle.findById(currentRiddleId).select('-answer');

        if (!riddleToSend && !isUnlocked) {
            // If the folder is not unlocked but we couldn't find a riddle, it's an issue.
            return res.status(500).json({ message: 'Riddle for this folder could not be loaded. Please contact support.' });
        }
        // If riddleToSend is null AND isUnlocked is true, it means the folder is completed,
        // and that's handled by the frontend.

        res.status(200).json({ folder, riddle: riddleToSend, isUnlocked });

    } catch (error) {
        console.error("Error in getFolderDetails:", error);
        return res.status(500).json({ message: 'Failed to load folder details due to a server error. Please try again.' });
    }
};


// @desc    Submit answer for a riddle
// @route   POST /api/game/answer/:folderId
// @access  Private
exports.submitAnswer = async (req, res) => {
    const { answer } = req.body;
    const { folderId } = req.params;
    const userId = req.user.id;

    try {
        const folder = await Folder.findById(folderId).populate('riddle');
        if (!folder) return res.status(404).json({ message: 'Folder not found.' });
        if (!folder.riddle) return res.status(500).json({ message: 'Folder has no riddle configured.' });

        let gameState = await GameState.findOne({ user: userId });
        if (!gameState) return res.status(404).json({ message: 'Game state not found.' });

        // Determine the current riddle
        let currentRiddle = folder.riddle;
        const unlockedFolderEntry = gameState.unlockedFolders.find(uf => uf.folderId.equals(folder._id));

        if (unlockedFolderEntry && unlockedFolderEntry.currentRiddleAttempt) {
            const nestedRiddle = await Riddle.findById(unlockedFolderEntry.currentRiddleAttempt);
            if (!nestedRiddle) return res.status(404).json({ message: 'Current riddle not found.' });
            currentRiddle = nestedRiddle;
        }

        const cleanedSubmittedAnswer = answer.trim();
        const cleanedExpectedAnswer = currentRiddle.answer.trim();

        const isCorrect = currentRiddle.answerCaseSensitive
            ? cleanedSubmittedAnswer === cleanedExpectedAnswer
            : cleanedSubmittedAnswer.toLowerCase() === cleanedExpectedAnswer.toLowerCase();

        if (isCorrect) {
            const folderIndex = gameState.unlockedFolders.findIndex(uf => uf.folderId.equals(folder._id));

            if (currentRiddle.nextRiddle) {
                // ✅ Move to next nested riddle
                if (folderIndex !== -1) {
                    gameState.unlockedFolders[folderIndex].currentRiddleAttempt = currentRiddle.nextRiddle;
                } else {
                    gameState.unlockedFolders.push({
                        folderId: folder._id,
                        unlockedAt: new Date(),
                        currentRiddleAttempt: currentRiddle.nextRiddle,
                    });
                }

                await gameState.save();

                const nextRiddle = await Riddle.findById(currentRiddle.nextRiddle).select('-answer');
                if (!nextRiddle) return res.status(500).json({ message: 'Next riddle not found.' });

                return res.status(200).json({
                    message: 'Correct answer! Here is the next part of the riddle.',
                    unlocked: false,
                    nextRiddle,
                });
            } else {
                // ✅ Last riddle solved — unlock the folder
                if (folderIndex !== -1) {
                    gameState.unlockedFolders[folderIndex].currentRiddleAttempt = null;
                    gameState.unlockedFolders[folderIndex].unlockedAt = new Date();
                } else {
                    gameState.unlockedFolders.push({
                        folderId: folder._id,
                        unlockedAt: new Date(),
                        currentRiddleAttempt: null,
                    });
                }

                gameState.lastFolderUnlockedAt = new Date();
                await gameState.save();

                

                if (req.io) {
                    try {
                        req.io.emit('leaderboardUpdate', {
                            userId,
                            unlockedFoldersCount: gameState.unlockedFolders.filter(f => f.currentRiddleAttempt === null).length,
                        });
                    } catch (err) {
                        console.error(`[SubmitAnswer] Socket emit error: ${err.message}`);
                    }
                }

                return res.status(200).json({
                    message: 'Correct answer! Folder unlocked!',
                    unlocked: true,
                });
            }
        } else {
            return res.status(400).json({ message: 'Incorrect answer. Try again!' });
        }
    } catch (error) {
        console.error(`[SubmitAnswer ERROR] ${error.message}`, error);
        return res.status(500).json({ message: 'Internal Server Error during answer submission.' });
    }
};


// NEW CONTROLLER FUNCTION TO ADD
// @desc    Get all available folders in the game
// @route   GET /api/game/folders
// @access  Private (requires authentication to see the game structure)
exports.getAllFolders = async (req, res, next) => {
    try {
        // Find all folders and sort them by their 'order' field
        const folders = await Folder.find({}).sort({ order: 1 });
        res.status(200).json(folders);
    } catch (error) {
        console.error('Error fetching all folders:', error);
        // Pass the error to the Express error handling middleware
        next(error);
    }
};
