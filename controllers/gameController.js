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
exports.submitAnswer = async (req, res, next) => {
    const { answer } = req.body;
    const { folderId } = req.params;
    const userId = req.user.id; // Assuming req.user is populated by auth middleware

    // console.log(`[SubmitAnswer START] Received answer: "${answer}" for folder: ${folderId} by user: ${userId}`);

    try {
        const folder = await Folder.findById(folderId).populate('riddle');
        if (!folder) {
            console.warn(`[SubmitAnswer] Folder not found: ${folderId}`);
            return res.status(404).json({ message: 'Folder not found.' });
        }
        if (!folder.riddle) {
            console.error(`[SubmitAnswer] Folder ${folderId} has no initial riddle defined.`);
            return res.status(500).json({ message: 'Internal Server Error: Folder riddle not configured.' });
        }

        let gameState = await GameState.findOne({ user: userId });
        if (!gameState) {
            console.warn(`[SubmitAnswer] Game state not found for user: ${userId}`);
            return res.status(404).json({ message: 'Game state not found for user.' });
        }

        // Determine which riddle the user is currently attempting for this folder
        let currentRiddle = folder.riddle;
        const unlockedFolderEntry = gameState.unlockedFolders.find(uf => uf.folderId.equals(folder._id));

        if (unlockedFolderEntry && unlockedFolderEntry.currentRiddleAttempt) {
            const nestedRiddle = await Riddle.findById(unlockedFolderEntry.currentRiddleAttempt);
            if (!nestedRiddle) {
                console.error(`[SubmitAnswer] Current nested riddle not found: ${unlockedFolderEntry.currentRiddleAttempt} for folder ${folderId}`);
                return res.status(404).json({ message: 'Current riddle not found. Please contact support.' });
            }
            currentRiddle = nestedRiddle;
        }

        // console.log(`[SubmitAnswer] Current Riddle ID: ${currentRiddle._id}`);
        // console.log(`[SubmitAnswer] Riddle expected answer: "${currentRiddle.answer}"`);
        // console.log(`[SubmitAnswer] Riddle case-sensitive setting: ${currentRiddle.answerCaseSensitive}`);
        // console.log(`[SubmitAnswer] User submitted answer: "${answer}"`);

        const cleanedSubmittedAnswer = answer.trim();
        const cleanedExpectedAnswer = currentRiddle.answer.trim();

        const isCorrect = currentRiddle.answerCaseSensitive
            ? cleanedSubmittedAnswer === cleanedExpectedAnswer
            : cleanedSubmittedAnswer.toLowerCase() === cleanedExpectedAnswer.toLowerCase();

        // console.log(`[SubmitAnswer] Comparison result (isCorrect): ${isCorrect}`);

        if (isCorrect) {
            // console.log(`[SubmitAnswer - Correct] Answer is correct for folder: ${folderId}`);

            if (currentRiddle.nextRiddle) {
                // console.log(`[SubmitAnswer - Correct] Moving to next riddle: ${currentRiddle.nextRiddle}`);
                const folderIndex = gameState.unlockedFolders.findIndex(uf => uf.folderId.equals(folder._id));
                if (folderIndex !== -1) {
                    gameState.unlockedFolders[folderIndex].currentRiddleAttempt = currentRiddle.nextRiddle;
                    // console.log(`[SubmitAnswer - Correct] Updated currentRiddleAttempt for existing entry.`);
                } else {
                    // This block should ideally not be hit for nested riddles
                    console.warn(`[SubmitAnswer - Correct] Creating new unlockedFolder entry for nested riddle. This might indicate a logic anomaly in how folders are initially added to gameState.`);
                    gameState.unlockedFolders.push({
                        folderId: folder._id,
                        unlockedAt: new Date(),
                        currentRiddleAttempt: currentRiddle.nextRiddle
                    });
                }
                // console.log(`[SubmitAnswer - Correct] Saving game state for nested riddle...`);
                await gameState.save();
                // console.log(`[SubmitAnswer - Correct] Game state saved.`);

                const nextRiddle = await Riddle.findById(currentRiddle.nextRiddle).select('-answer');
                if (!nextRiddle) {
                    // This is a crucial check if nextRiddle ID exists but the riddle itself doesn't.
                    console.error(`[SubmitAnswer - Correct] Next riddle not found for ID: ${currentRiddle.nextRiddle}`);
                    return res.status(500).json({ message: 'Internal Server Error: Next riddle not found.' });
                }
                // console.log(`[SubmitAnswer - Correct] Sending response for next riddle.`);
                return res.status(200).json({
                    message: 'Correct answer! Here is the next part of the riddle.',
                    unlocked: false,
                    nextRiddle: nextRiddle,
                });
            } else {
                // console.log(`[SubmitAnswer - Correct] Final riddle solved for folder: ${folderId}. Attempting to unlock folder.`);
                const isFolderAlreadyUnlocked = gameState.unlockedFolders.some(uf => uf.folderId.equals(folder._id));

                if (!isFolderAlreadyUnlocked) {
                    // console.log(`[SubmitAnswer - Correct] Folder ${folderId} was not previously fully unlocked. Adding to gameState.`);
                    gameState.unlockedFolders.push({
                        folderId: folder._id,
                        unlockedAt: new Date(),
                        currentRiddleAttempt: null // Clear attempt once fully unlocked
                    });
                    gameState.lastFolderUnlockedAt = new Date(); // Update user's overall game state (if needed for leaderboard)
                    // console.log(`[SubmitAnswer - Correct] Saving game state with unlocked folder...`);
                    await gameState.save();
                    // console.log(`[SubmitAnswer - Correct] Game state saved.`);

                    // console.log(`[SubmitAnswer - Correct] Updating user last activity...`);
                    // Ensure User model is correctly imported at the top of the file
                    try {
                        await User.findByIdAndUpdate(userId, { lastActivity: new Date() });
                        // console.log(`[SubmitAnswer - Correct] User last activity updated.`);
                    } catch (userUpdateError) {
                        console.error(`[SubmitAnswer - Correct] Error updating user last activity: ${userUpdateError.message}`, userUpdateError);
                        // Decide if this error should block the response. Probably not, it's a secondary update.
                        // You might still want to proceed with the success response for the riddle.
                    }

                    // console.log(`[SubmitAnswer - Correct] Attempting to emit leaderboard update...`);
                    // Ensure req.io is correctly attached by your server setup (e.g., in app.js or server.js)
                    if (req.io) {
                        try {
                            req.io.emit('leaderboardUpdate', {
                                userId: userId,
                                unlockedFoldersCount: gameState.unlockedFolders.length,
                            });
                            // console.log(`[SubmitAnswer - Correct] Leaderboard update emitted successfully.`);
                        } catch (socketEmitError) {
                            console.error(`[SubmitAnswer - Correct] Error emitting leaderboard update via Socket.IO: ${socketEmitError.message}`, socketEmitError);
                            // This error should definitely not block the main response.
                        }
                    } else {
                        console.warn(`[SubmitAnswer - Correct] Socket.IO instance (req.io) not available. Cannot emit leaderboard update.`);
                    }

                    // console.log(`[SubmitAnswer - Correct] Sending final success response for unlocked folder.`);
                    return res.status(200).json({ message: 'Correct answer! Folder unlocked!', unlocked: true });
                } else {
                    console.warn(`[SubmitAnswer - Correct] Folder ${folderId} was already fully unlocked. Sending success response.`);
                    return res.status(200).json({ message: 'Correct answer! This folder was already unlocked.', unlocked: true });
                }
            }
        } else {
            // console.log(`[SubmitAnswer - Incorrect] Incorrect answer for folder: ${folderId}`);
            return res.status(400).json({ message: 'Incorrect answer. Try again!' });
        }
    } catch (error) {
        console.error(`[SubmitAnswer ERROR] Uncaught error in submitAnswer: ${error.message}`, error); // More detailed error logging
        // IMPORTANT: If you want to return a 500 status on *any* error, ensure you don't return res.status before this.
        return res.status(500).json({ message: 'Internal Server Error during answer submission.' }); // Explicitly send 500
        // next(error); // Alternatively, let your global error handler catch it.
    } finally {
        // console.log(`[SubmitAnswer END]`);
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
