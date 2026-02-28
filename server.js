const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

// Tells the server to send your index.html to anyone who visits your link
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const gameRooms = {
    "NA-East": { players: 0, max: 4 },
    "NA-West": { players: 0, max: 4 }
};

const allPlayers = {}; 

console.log("Server is starting...");

io.on('connection', (socket) => {
    console.log("A player connected! Their ID is: " + socket.id);
    
    socket.emit('server-list', gameRooms);

    socket.on('join-room', (roomName) => {
        let room = gameRooms[roomName];

        if (room.players < room.max) {
            room.players++; 
            socket.currentRoom = roomName; 
            
            socket.join(roomName); 
            socket.emit('joined-success', roomName); 
            io.emit('server-list', gameRooms); 

            allPlayers[socket.id] = {
                id: socket.id,
                room: roomName,
                x: Math.floor(Math.random() * 10) - 5, 
                y: 10,
                z: Math.floor(Math.random() * 10) - 5
            };

            const playersInThisRoom = {};
            for (let id in allPlayers) {
                if (allPlayers[id].room === roomName) {
                    playersInThisRoom[id] = allPlayers[id];
                }
            }

            socket.emit('current-players', playersInThisRoom);
            socket.to(roomName).emit('new-player-joined', allPlayers[socket.id]);

        } else {
            socket.emit('room-full');
        }
    });

    socket.on('player-moved', (movementData) => {
        if (allPlayers[socket.id]) {
            allPlayers[socket.id].x = movementData.x;
            allPlayers[socket.id].y = movementData.y;
            allPlayers[socket.id].z = movementData.z;
            allPlayers[socket.id].ry = movementData.ry; 

            socket.to(socket.currentRoom).emit('player-moved', allPlayers[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log("A player left! ID: " + socket.id);
        if (socket.currentRoom) {
            gameRooms[socket.currentRoom].players--;
            io.emit('server-list', gameRooms); 
            delete allPlayers[socket.id];
            io.to(socket.currentRoom).emit('player-left', socket.id);
        }
    });
});

// Replit handles ports automatically, but 3000 is still safe to use here
http.listen(3000, () => {
    console.log("Multiplayer server is awake and listening!");
});