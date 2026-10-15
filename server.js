const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Explicitly serve your index.html file at the home URL
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows connections from any mobile or desktop device
        methods: ["GET", "POST"]
    }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            // First player joins: Initialize room state variables
            rooms[roomId] = {
                players: [socket.id],
                scores: { p1: 0, p2: 0 },
                ball: { x: 400, y: 250, dx: 4, dy: 3 },
                p1Paddle: 200,
                p2Paddle: 200,
                gameLoopStarted: false
            };
            socket.emit('player_assignment', 1);
        } else if (rooms[roomId].players.length === 1) {
            // Second player joins
            rooms[roomId].players.push(socket.id);
            socket.emit('player_assignment', 2);
            io.to(roomId).emit('game_ready');

            if (!rooms[roomId].gameLoopStarted) {
                rooms[roomId].gameLoopStarted = true;
                startGameLoop(roomId);
            }
        } else {
            // Room is full
            socket.emit('room_full');
            socket.disconnect();
        }
    });

    socket.on('update_paddle', (data) => {
        const { roomId, playerNum, y } = data;
        if (rooms[roomId]) {
            if (playerNum === 1) rooms[roomId].p1Paddle = y;
            if (playerNum === 2) rooms[roomId].p2Paddle = y;
            socket.to(roomId).emit('paddle_moved', { playerNum, y });
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players.includes(socket.id)) {
                io.to(roomId).emit('opponent_left');
                delete rooms[roomId];
                break;
            }
        }
    });
});

function startGameLoop(roomId) {
    const interval = setInterval(() => {
        const room = rooms[roomId];
        if (!room || room.players.length < 2) {
            clearInterval(interval);
            return;
        }

        let ball = room.ball;
        ball.x += ball.dx;
        ball.y += ball.dy;

        // Wall collisions
        if (ball.y <= 10 || ball.y >= 490) {
            ball.dy *= -1;
        }

        const pWidth = 15;
        const pHeight = 90;

        // Player 1 Collision
        if (ball.x <= 35 && ball.x >= 20) {
            if (ball.y >= room.p1Paddle && ball.y <= room.p1Paddle + pHeight) {
                ball.dx = Math.abs(ball.dx) + 0.5;
                let hitPoint = ball.y - (room.p1Paddle + pHeight / 2);
                ball.dy = hitPoint * 0.2;
            }
        }

        // Player 2 Collision
        if (ball.x >= 765 && ball.x <= 780) {
            if (ball.y >= room.p2Paddle && ball.y <= room.p2Paddle + pHeight) {
                ball.dx = -Math.abs(ball.dx) - 0.5;
                let hitPoint = ball.y - (room.p2Paddle + pHeight / 2);
                ball.dy = hitPoint * 0.2;
            }
        }

        // Score logic
        if (ball.x < 0) {
            room.scores.p2 += 1;
            resetBall(ball, -4);
            io.to(roomId).emit('update_scores', room.scores);
        } else if (ball.x > 800) {
            room.scores.p1 += 1;
            resetBall(ball, 4);
            io.to(roomId).emit('update_scores', room.scores);
        }

        io.to(roomId).emit('ball_sync', ball);
    }, 1000 / 60);
}

function resetBall(ball, initialDx) {
    ball.x = 400;
    ball.y = 250;
    ball.dx = initialDx;
    ball.dy = (Math.random() > 0.5 ? 3 : -3);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Multiplayer server running on port ${PORT}`));
