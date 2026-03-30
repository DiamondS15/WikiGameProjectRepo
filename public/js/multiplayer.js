const socket = io();

const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const startGameBtn = document.getElementById('startGameBtn');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomStatus = document.getElementById('roomStatus');
const goalTitle = document.getElementById('goal-title');
const startTitle = document.getElementById('start-title');
const currentTitleSide = document.getElementById('current-title-side');
const currentTitleHeader = document.getElementById('current-title');
const playerList = document.getElementById('playerList');
const setupMessage = document.getElementById('setupMessage');
const articleContent = document.getElementById('article-content');

let currentRoomCode = '';
let currentRoom = null;
let mySocketId = '';
let currentLoadedArticle = '';

socket.on('connect', () => {
    mySocketId = socket.id;
    console.log('Connected:', socket.id);
});

function showMessage(message, isError = false) {
    setupMessage.textContent = message;
    setupMessage.className = isError ? 'small text-danger' : 'small text-muted';
}

function getPlayerName() {
    const name = playerNameInput.value.trim();
    return name || 'Player';
}

function getMyPlayer(room) {
    return room.players.find(player => player.id === mySocketId);
}

function getWinner(room) {
    if (!room || !room.winnerId) {
        return null;
    }

    return room.players.find(player => player.id === room.winnerId);
}

function isPlayableWikiLink(href) {
    if (!href) {
        return false;
    }

    if (!href.startsWith('/wiki/')) {
        return false;
    }

    if (href.includes(':')) {
        return false;
    }

    return true;
}

function decodeWikiTitle(href) {
    return decodeURIComponent(href.replace('/wiki/', '').replace(/_/g, ' '));
}

function wireArticleLinks() {
    const links = articleContent.querySelectorAll('a');

    links.forEach(link => {
        const href = link.getAttribute('href');

        if (!isPlayableWikiLink(href)) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
            });
            return;
        }

        link.addEventListener('click', (e) => {
            e.preventDefault();

            if (!currentRoom || currentRoom.status !== 'playing') {
                return;
            }

            const articleTitle = decodeWikiTitle(href);

            socket.emit('player:navigate', {
                roomCode: currentRoomCode,
                articleTitle: articleTitle
            }, (response) => {
                if (!response.success) {
                    showMessage(response.message || 'Could not move.', true);
                }
            });
        });
    });
}

async function loadArticle(title) {
    if (!title) {
        return;
    }

    try {
        currentLoadedArticle = title;

        articleContent.innerHTML = `
            <div class="text-center mt-5">
                <div class="spinner-border text-secondary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2 text-muted">Loading article...</p>
            </div>
        `;

        const response = await fetch(`/api/article/${encodeURIComponent(title)}`);
        const data = await response.json();

        if (data.error) {
            articleContent.innerHTML = '<p class="text-danger">Failed to load article.</p>';
            return;
        }

        articleContent.innerHTML = data.content;
        wireArticleLinks();
    } catch (error) {
        console.error('Error loading article:', error);
        articleContent.innerHTML = '<p class="text-danger">Failed to load article.</p>';
    }
}

function renderPlayers(players, hostId, winnerId) {
    if (!players || players.length === 0) {
        playerList.innerHTML = 'No players yet';
        return;
    }

    playerList.innerHTML = players.map(player => {
        let text = `${player.name} - ${player.moves} move${player.moves === 1 ? '' : 's'}`;

        if (player.id === hostId) {
            text += ' (Host)';
        }

        if (player.id === winnerId) {
            text += ' 🏆 Winner';
        } else if (player.finished) {
            text += ' ✅';
        }

        return `<div class="mb-1">${text}</div>`;
    }).join('');
}

function renderRoom(room) {
    currentRoom = room;

    roomCodeDisplay.textContent = room.roomCode || '-';
    roomStatus.textContent = room.status || '-';
    goalTitle.textContent = room.goalArticle || '-';
    startTitle.textContent = room.startArticle || '-';

    renderPlayers(room.players, room.hostId, room.winnerId);

    const myPlayer = getMyPlayer(room);

    if (myPlayer) {
        currentTitleSide.textContent = myPlayer.currentArticle || '-';
        currentTitleHeader.innerHTML = `Current: <span class="text-muted">${myPlayer.currentArticle || 'Not started'}</span>`;
    } else {
        currentTitleSide.textContent = '-';
        currentTitleHeader.innerHTML = `Current: <span class="text-muted">Not started</span>`;
    }

    const amIHost = room.hostId === mySocketId;
    const winner = getWinner(room);

    if (room.status === 'lobby' && amIHost) {
        startGameBtn.style.display = 'block';
        showMessage('You are the host. Start when everyone is ready.');
    } else if (room.status === 'lobby') {
        startGameBtn.style.display = 'none';
        showMessage('Waiting for the host to start the game.');
    } else if (room.status === 'playing') {
        startGameBtn.style.display = 'none';
        showMessage('Game in progress.');
    } else if (room.status === 'finished') {
        startGameBtn.style.display = 'none';

        if (winner) {
            if (winner.id === mySocketId) {
                showMessage(`You won! You reached ${room.goalArticle}.`);
            } else {
                showMessage(`${winner.name} won the game by reaching ${room.goalArticle}.`);
            }
        } else {
            showMessage('Game finished.');
        }
    } else {
        startGameBtn.style.display = 'none';
    }

    if (myPlayer && myPlayer.currentArticle && currentLoadedArticle !== myPlayer.currentArticle) {
        loadArticle(myPlayer.currentArticle);
    }
}

createRoomBtn.addEventListener('click', () => {
    const playerName = getPlayerName();

    socket.emit('room:create', playerName, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            currentLoadedArticle = '';
            renderRoom(response.room);
            showMessage(`Room ${response.roomCode} created.`);
        } else {
            showMessage('Failed to create room.', true);
        }
    });
});

joinRoomBtn.addEventListener('click', () => {
    const playerName = getPlayerName();
    const roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!roomCode) {
        showMessage('Please enter a room code.', true);
        return;
    }

    socket.emit('room:join', { roomCode, playerName }, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            currentLoadedArticle = '';
            renderRoom(response.room);
            showMessage(`Joined room ${response.roomCode}.`);
        } else {
            showMessage(response.message || 'Failed to join room.', true);
        }
    });
});

startGameBtn.addEventListener('click', () => {
    if (!currentRoomCode) {
        showMessage('Create or join a room first.', true);
        return;
    }

    socket.emit('game:start', currentRoomCode, (response) => {
        if (response.success) {
            currentLoadedArticle = '';
            renderRoom(response.room);
            showMessage('Game started.');
        } else {
            showMessage(response.message || 'Failed to start game.', true);
        }
    });
});

socket.on('room:update', (room) => {
    if (room && room.roomCode === currentRoomCode) {
        renderRoom(room);
    }
});