// server/models/GameState.js
const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true, // Each user has one game state
    },
    unlockedFolders: [
        {
            folderId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Folder',
            },
            unlockedAt: {
                type: Date,
                default: Date.now,
            },
            currentRiddleAttempt: { // For nested riddles, track which riddle within a folder they are on
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Riddle',
                default: null,
            },
        },
    ],
    // Store game start time to calculate total time for leaderboard
    gameStartTime: {
        type: Date,
        default: Date.now, // Set when user starts first game activity
    },
    lastFolderUnlockedAt: {
        type: Date,
        default: null,
    }
},{ timestamps: true });

module.exports = mongoose.model('GameState', GameStateSchema);