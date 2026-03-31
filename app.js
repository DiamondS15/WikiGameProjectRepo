const express = require('express');
const fetch = require('node-fetch');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3001;

const topicClusters = {
    'Science': ['Physics', 'Chemistry', 'Biology', 'Astronomy', 'Mathematics'],
    'History': ['Ancient History', 'Medieval History', 'World War II', 'Civilizations'],
    'Art': ['Painting', 'Sculpture', 'Renaissance Art', 'Modern Art'],
    'Music': ['Classical Music', 'Rock Music', 'Jazz', 'Musicians'],
    'Technology': ['Computers', 'Internet', 'Programming', 'Artificial Intelligence'],
    'Philosophy': ['Ethics', 'Metaphysics', 'Epistemology', 'Logic'],
    'Literature': ['Novels', 'Poetry', 'Writers', 'Literary Movements'],
    'Sports': ['Olympic Games', 'Football', 'Basketball', 'Athletes']
};

// in-memory multiplayer rooms
const rooms = {};

// Serve static files
app.use(express.static('public'));

// Home route
app.get('/', (req, res) => {
    res.send('Server is working! Go to <a href="/SinglePlayer.html">/SinglePlayer.html</a>');
});

// REAL Wikipedia API endpoint
app.get('/api/random-article', async (req, res) => {
    try {
        const response = await fetch(
            'https://en.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*'
        );
        const data = await response.json();
        const title = data.query.random[0].title;
        res.json({ title });
    } catch (error) {
        console.error('Error:', error);
        const articles = ['Philosophy', 'Science', 'History', 'Art', 'Music'];
        const random = articles[Math.floor(Math.random() * articles.length)];
        res.json({ title: random });
    }
});

// article content endpoint
app.get('/api/article/:title', async (req, res) => {
    try {
        const title = req.params.title;

        const response = await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`
        );
        const data = await response.json();

        if (data.error) {
            return res.status(404).json({ error: 'Article not found' });
        }

        res.json({
            title: data.parse.title,
            content: data.parse.text['*']
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch article' });
    }
});

app.get('/api/related-article-simple/:title', async (req, res) => {
    const categories = Object.keys(topicClusters);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const topics = topicClusters[randomCategory];
    const related = topics[Math.floor(Math.random() * topics.length)];
    res.json({ title: related });
});

// helper to create room codes
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

// helper to get public room state
function getRoomState(roomCode) {
    const room = rooms[roomCode];

    if (!room) {
        return null;
    }

    return {
        roomCode: roomCode,
        hostId: room.hostId,
        status: room.status,
        players: room.players
    };
}

// socket.io connection
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('room:create', (playerName, callback) => {
        const roomCode = generateRoomCode();

        rooms[roomCode] = {
            hostId: socket.id,
            status: 'lobby',
            players: [
                {
                    id: socket.id,
                    name: playerName || 'Player 1'
                }
            ]
        };

        socket.join(roomCode);

        if (callback) {
            callback({
                success: true,
                roomCode: roomCode,
                room: getRoomState(roomCode)
            });
        }

        io.to(roomCode).emit('room:update', getRoomState(roomCode));
    });

    socket.on('room:join', (data, callback) => {
        const roomCode = data.roomCode;
        const playerName = data.playerName;
        const room = rooms[roomCode];

        if (!room) {
            if (callback) {
                callback({ success: false, message: 'Room not found' });
            }
            return;
        }

        if (room.players.length >= 4) {
            if (callback) {
                callback({ success: false, message: 'Room is full' });
            }
            return;
        }

        if (room.status !== 'lobby') {
            if (callback) {
                callback({ success: false, message: 'Game already started' });
            }
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName || 'Player'
        });

        socket.join(roomCode);

        if (callback) {
            callback({
                success: true,
                roomCode: roomCode,
                room: getRoomState(roomCode)
            });
        }

        io.to(roomCode).emit('room:update', getRoomState(roomCode));
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(player => player.id === socket.id);

            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);

                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    if (room.hostId === socket.id) {
                        room.hostId = room.players[0].id;
                    }

                    io.to(roomCode).emit('room:update', getRoomState(roomCode));
                }

                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});