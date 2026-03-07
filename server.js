const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = 3000;
const MAX_PLAYERS_PER_ROOM = 10;
const gameRooms = {};
const allPlayers = {};

const spawnPoints = [
  { x: 600, z: 600 },
  { x: -600, z: 600 },
  { x: 600, z: -600 },
  { x: -600, z: -600 },
];

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function emitRoomList() {
  io.emit("server-list", gameRooms);
}

function getPlayersInRoom(roomName) {
  const playersInRoom = {};

  for (const [id, player] of Object.entries(allPlayers)) {
    if (player.room === roomName) {
      playersInRoom[id] = player;
    }
  }

  return playersInRoom;
}

function pickSpawnPoint() {
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function normalizeText(value, fallback, maxLength) {
  const trimmed = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return trimmed || fallback;
}

function leaveCurrentRoom(socket) {
  const oldRoomName = socket.currentRoom;
  if (!oldRoomName) {
    return;
  }

  const oldRoom = gameRooms[oldRoomName];
  const hadPlayer = Boolean(allPlayers[socket.id]);

  socket.leave(oldRoomName);

  if (hadPlayer) {
    delete allPlayers[socket.id];
    io.to(oldRoomName).emit("player-left", socket.id);
  }

  if (oldRoom) {
    oldRoom.players = Math.max(0, oldRoom.players - 1);
    if (oldRoom.players === 0) {
      delete gameRooms[oldRoomName];
    }
  }

  socket.currentRoom = null;
  emitRoomList();
}

console.log("Server is starting...");

io.on("connection", (socket) => {
  console.log(`A player connected. Their ID is ${socket.id}`);
  socket.emit("server-list", gameRooms);

  socket.on("create-room", (roomName) => {
    const normalizedRoomName = normalizeText(roomName, "", 30);
    if (!normalizedRoomName) {
      return;
    }

    if (!gameRooms[normalizedRoomName]) {
      gameRooms[normalizedRoomName] = {
        players: 0,
        max: MAX_PLAYERS_PER_ROOM,
      };
      emitRoomList();
    }
  });

  socket.on("join-room", (data = {}) => {
    const roomName = normalizeText(data.room, "", 30);
    const playerName = normalizeText(data.username, "Guest", 20);

    if (!roomName) {
      socket.emit("room-full");
      return;
    }

    if (!gameRooms[roomName]) {
      gameRooms[roomName] = {
        players: 0,
        max: MAX_PLAYERS_PER_ROOM,
      };
    }

    if (socket.currentRoom === roomName && allPlayers[socket.id]) {
      socket.emit("joined-success", roomName);
      socket.emit("current-players", getPlayersInRoom(roomName));
      emitRoomList();
      return;
    }

    if (socket.currentRoom && socket.currentRoom !== roomName) {
      leaveCurrentRoom(socket);
    }

    const room = gameRooms[roomName];
    if (!room || room.players >= room.max) {
      socket.emit("room-full");
      return;
    }

    room.players += 1;
    socket.currentRoom = roomName;
    socket.join(roomName);

    const spawn = pickSpawnPoint();
    allPlayers[socket.id] = {
      id: socket.id,
      username: playerName,
      room: roomName,
      x: spawn.x,
      y: 100,
      z: spawn.z,
      ry: 0,
    };

    socket.emit("joined-success", roomName);
    socket.emit("current-players", getPlayersInRoom(roomName));
    socket.to(roomName).emit("new-player-joined", allPlayers[socket.id]);
    emitRoomList();
  });

  socket.on("player-moved", (movementData = {}) => {
    const player = allPlayers[socket.id];
    if (!player || !socket.currentRoom) {
      return;
    }

    player.x = Number(movementData.x) || 0;
    player.y = Number(movementData.y) || 0;
    player.z = Number(movementData.z) || 0;
    player.ry = Number(movementData.ry) || 0;

    socket.to(socket.currentRoom).emit("player-moved", player);
  });

  socket.on("chat-message", (msg) => {
    const player = allPlayers[socket.id];
    if (!player || !socket.currentRoom) {
      return;
    }

    const text = normalizeText(msg, "", 200);
    if (!text) {
      return;
    }

    io.to(socket.currentRoom).emit("chat-message", {
      name: player.username,
      text,
    });
  });

  socket.on("disconnect", () => {
    console.log(`A player left. ID ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Multiplayer server is awake and listening on http://localhost:${PORT}`);
});
