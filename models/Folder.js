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
    dependencies: [ // Array of folder IDs that must be unlocked first
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Folder',
        },
    ],
});

module.exports = mongoose.model('Folder', FolderSchema);