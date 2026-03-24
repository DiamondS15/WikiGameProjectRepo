const socket = io();

const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const setupMessage = document.getElementById('setupMessage');

const roomInfo = document.getElementById('roomInfo');
const lobbySection = document.getElementById('lobbySection');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomStatus = document.getElementById('roomStatus');
const playerList = document.getElementById('playerList');
const hostMessage = document.getElementById('hostMessage');
const startGameBtn = document.getElementById('startGameBtn');

let currentRoomCode = '';
let currentRoom = null;
let mySocketId = '';

socket.on('connect', () => {
    mySocketId = socket.id;
    console.log('Connected to server:', socket.id);
});

function showMessage(message, isError = false) {
    setupMessage.textContent = message;
    setupMessage.style.color = isError ? '#ffb3b3' : '#ffeb3b';
}

function getPlayerName() {
    const name = playerNameInput.value.trim();
    return name || 'Player';
}

function renderRoom(room) {
    currentRoom = room;

    roomInfo.style.display = 'block';
    lobbySection.style.display = 'block';

    roomCodeDisplay.textContent = room.roomCode;
    roomStatus.textContent = room.status;

    playerList.innerHTML = '';

    room.players.forEach(player => {
        const li = document.createElement('li');

        let text = player.name;

        if (player.id === room.hostId) {
            text += ' (Host)';
        }

        li.textContent = text;
        playerList.appendChild(li);
    });

    const amIHost = room.hostId === mySocketId;

    if (amIHost) {
        hostMessage.textContent = 'You are the host. You will be able to start the game.';
        startGameBtn.style.display = 'inline-block';
    } else {
        hostMessage.textContent = 'Waiting for the host to start the game.';
        startGameBtn.style.display = 'none';
    }
}

createRoomBtn.addEventListener('click', () => {
    const playerName = getPlayerName();

    socket.emit('room:create', playerName, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            renderRoom(response.room);
            showMessage('Room created successfully.');
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
            renderRoom(response.room);
            showMessage('Joined room successfully.');
        } else {
            showMessage(response.message || 'Failed to join room.', true);
        }
    });
});

socket.on('room:update', (room) => {
    if (room && room.roomCode === currentRoomCode) {
        renderRoom(room);
    }
});

startGameBtn.addEventListener('click', () => {
    showMessage('');
});