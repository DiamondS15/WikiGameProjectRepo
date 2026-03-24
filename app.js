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

// best-link endpoint
app.get('/api/best-link', async (req, res) => {
    try {
        const { current, goal } = req.query;

        if (!current || !goal) {
            return res.status(400).json({ error: 'Missing current or goal article' });
        }

        console.log(`Finding best link from "${current}" to "${goal}"`);

        const currentResponse = await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(current)}&format=json&prop=links&origin=*`
        );
        const currentData = await currentResponse.json();

        if (!currentData.parse || !currentData.parse.links) {
            return res.json({ bestLink: null, message: 'Could not analyze article links' });
        }

        const links = currentData.parse.links
            .filter(link => link.ns === 0)
            .map(link => link['*']);

        console.log(`Found ${links.length} links in current article`);

        if (links.length === 0) {
            return res.json({ bestLink: null, message: 'No links found in this article' });
        }

        const goalLower = goal.toLowerCase();

        for (const link of links) {
            if (link.toLowerCase() === goalLower) {
                console.log(`✓ DIRECT MATCH FOUND: "${link}" IS YOUR GOAL!`);
                return res.json({
                    bestLink: link,
                    message: `"${link}" - THIS IS YOUR GOAL! Click it to win!`,
                    directMatch: true,
                    isGoal: true
                });
            }
        }

        const goalWords = goalLower.split(' ');
        for (const link of links) {
            const linkLower = link.toLowerCase();

            for (const word of goalWords) {
                if (word.length > 3 && linkLower.includes(word)) {
                    console.log(`PARTIAL MATCH FOUND: "${link}" contains "${word}"`);
                    return res.json({
                        bestLink: link,
                        message: `"${link}" - contains "${word}" which relates to your goal "${goal}"`,
                        partialMatch: true
                    });
                }
            }

            if (linkLower === goalLower + 's' || linkLower + 's' === goalLower) {
                console.log(`PLURAL MATCH FOUND: "${link}" matches "${goal}"`);
                return res.json({
                    bestLink: link,
                    message: `"${link}" - matches your goal "${goal}"`,
                    pluralMatch: true
                });
            }
        }

        const scoredLinks = [];

        for (const link of links) {
            let score = 0;
            let reasons = [];

            for (const word of goalWords) {
                if (word.length > 3 && link.toLowerCase().includes(word)) {
                    score += 30;
                    reasons.push(`contains "${word}"`);
                }
            }

            if (goal === 'Poetry') {
                const poetryTerms = ['poet', 'poem', 'literature', 'verse', 'rhyme', 'sonnet'];
                for (const term of poetryTerms) {
                    if (link.toLowerCase().includes(term)) {
                        score += 20;
                        reasons.push('related to poetry');
                        break;
                    }
                }
            }

            if (score > 0) {
                scoredLinks.push({
                    title: link,
                    score: score,
                    reason: reasons.join(', ')
                });
            }
        }

        if (scoredLinks.length > 0) {
            scoredLinks.sort((a, b) => b.score - a.score);
            const best = scoredLinks[0];

            res.json({
                bestLink: best.title,
                message: `"${best.title}" - ${best.reason || 'related to your goal'}`,
                alternatives: scoredLinks.slice(0, 3).map(l => l.title)
            });
        } else {
            const randomLink = links[Math.floor(Math.random() * links.length)];
            res.json({
                bestLink: randomLink,
                message: `Try "${randomLink}" - no clearly related links found`,
                isRandom: true
            });
        }

    } catch (error) {
        console.error('Error finding best link:', error);
        res.status(500).json({ error: 'Failed to analyze links' });
    }
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