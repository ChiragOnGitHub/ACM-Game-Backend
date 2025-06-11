// server/sockets/leaderboardSocket.js
// This module will be imported by server.js to set up Socket.IO
module.exports = (io) => {
    io.on('connection', (socket) => {
        // console.log('A user connected via socket.io');

        // This event can be triggered by the admin panel to request a leaderboard refresh
        socket.on('requestLeaderboard', async () => {
            try {
                // Call the same aggregation logic as in getLeaderboard controller
                const leaderboardData = await require('../models/GameState').aggregate([
                    {
                        $match: {
                            unlockedFolders: { $exists: true, $not: { $size: 0 } }
                        }
                    },
                    {
                        $addFields: {
                            unlockedCount: { $size: "$unlockedFolders" },
                            timeTaken: {
                                $cond: {
                                    if: { $and: ["$gameStartTime", "$lastFolderUnlockedAt"] },
                                    then: { $subtract: ["$lastFolderUnlockedAt", "$gameStartTime"] },
                                    else: { $ifNull: ["$gameStartTime", "$$NOW"] }
                                }
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'user',
                            foreignField: '_id',
                            as: 'userDetails',
                        },
                    },
                    {
                        $unwind: '$userDetails',
                    },
                    {
                        $project: {
                            _id: 0,
                            userId: '$user',
                            username: '$userDetails.username',
                            rollNumber: '$userDetails.rollNumber',
                            unlockedCount: 1,
                            timeTaken: 1,
                        },
                    },
                    {
                        $sort: {
                            unlockedCount: -1,
                            timeTaken: 1,
                        },
                    },
                ]);
                socket.emit('leaderboardData', leaderboardData);
            } catch (error) {
                console.error('Error fetching leaderboard for socket request:', error);
                socket.emit('leaderboardError', 'Failed to fetch leaderboard data.');
            }
        });

        socket.on('disconnect', () => {
            // console.log('User disconnected from socket.io');
        });
    });
};