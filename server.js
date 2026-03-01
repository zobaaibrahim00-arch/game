const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start with NO rooms! They will be created dynamically.
const gameRooms = {}; 
const allPlayers = {}; 

console.log("Server is starting...");

io.on('connection', (socket) => {
    console.log("A player connected! Their ID is: " + socket.id);
    
    // Send the current list of rooms to the new player
    socket.emit('server-list', gameRooms);

    // NEW: Listen for a player creating a new room
    socket.on('create-room', (roomName) => {
        if (!gameRooms[roomName]) {
            // Create the room with a max of 10 players (you can change this number)
            gameRooms[roomName] = { players: 0, max: 10 }; 
            io.emit('server-list', gameRooms); // Update everyone's lobby screen
        }
    });

    // Update the join-room listener to handle SWITCHING servers
    socket.on('join-room', (data) => {
        let roomName = data.room;
        let playerName = data.username || "Guest"; 
        let room = gameRooms[roomName];

        // --- NEW: If they are already in a room, make them leave it first! ---
        if (socket.currentRoom && socket.currentRoom !== roomName) {
            let oldRoom = gameRooms[socket.currentRoom];
            if (oldRoom) {
                oldRoom.players--;
                // Clean up empty rooms
                if (oldRoom.players <= 0) delete gameRooms[socket.currentRoom];
                
                io.emit('server-list', gameRooms); // Update everyone's menus
                socket.leave(socket.currentRoom); // Actually leave the websocket room
                io.to(socket.currentRoom).emit('player-left', socket.id); // Tell old room to delete your avatar
            }
        }

        if (room && room.players < room.max) {
            room.players++; 
            socket.currentRoom = roomName; 
            
            socket.join(roomName); 
            socket.emit('joined-success', roomName); 
            io.emit('server-list', gameRooms); 

            allPlayers[socket.id] = {
                id: socket.id,
                username: playerName, 
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

   // Update the chat listener to use their saved username!
    socket.on('chat-message', (msg) => {
        if (socket.currentRoom && allPlayers[socket.id]) {
            io.to(socket.currentRoom).emit('chat-message', { 
                name: allPlayers[socket.id].username, // <--- Send their real name
                text: msg 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log("A player left! ID: " + socket.id);
        if (socket.currentRoom && gameRooms[socket.currentRoom]) {
            gameRooms[socket.currentRoom].players--;
            
            // NEW: If the room is empty, delete it so the lobby stays clean!
            if (gameRooms[socket.currentRoom].players <= 0) {
                delete gameRooms[socket.currentRoom];
            }
            
            io.emit('server-list', gameRooms); 
            delete allPlayers[socket.id];
            io.to(socket.currentRoom).emit('player-left', socket.id);
        }
    });
});

http.listen(3000, () => {
    console.log("Multiplayer server is awake and listening!");
});



