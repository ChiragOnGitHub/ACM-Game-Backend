// server/models/Riddle.js
const mongoose = require('mongoose');

const RiddleSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
    },
    image: { // URL to the image for the riddle
        type: String,
        required: false, // Make it optional
    },
    answer: {
        type: String,
        required: true,
    },
    answerCaseSensitive: {
        type: Boolean,
        default: false, // If true, answer must match exactly
    },
    // For nested riddles: if answering this riddle leads to another riddle, store its ID
    nextRiddle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Riddle',
        default: null,
    }
});

module.exports = mongoose.model('Riddle', RiddleSchema);