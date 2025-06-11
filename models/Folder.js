// server/models/Folder.js
const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    order: { // To control display order
        type: Number,
        required: true,
        unique: true,
    },
    riddle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Riddle',
        required: true,
    },
    isLocked: {
        type: Boolean,
        default: true, // Default to locked
    },
    dependencies: [ // Array of folder IDs that must be unlocked first
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Folder',
        },
    ],
    // For nested riddles (optional, can be part of Riddle model too)
    // If a folder itself has a nested riddle, its `riddle` field points to the outer riddle.
    // The outer riddle's answer might then reveal another riddle ID.
});

module.exports = mongoose.model('Folder', FolderSchema);