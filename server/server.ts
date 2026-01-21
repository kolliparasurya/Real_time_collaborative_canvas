import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, DrawLine, UserCursor } from "../shared/types";

const PORT = 3000;
const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
});

// State maps for rooms
const roomHistories = new Map<string, DrawLine[]>();
const roomRedoStacks = new Map<string, DrawLine[]>();
const connectedUsers = new Map<string, { roomId: string, color: string }>();

const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

// Helper functions for room management
const getRoomHistory = (room: string) => {
    if (!roomHistories.has(room)) roomHistories.set(room, []);
    return roomHistories.get(room)!;
};

const getRoomRedoStack = (room: string) => {
    if (!roomRedoStacks.has(room)) roomRedoStacks.set(room, []);
    return roomRedoStacks.get(room)!;
};

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    const userColor = getRandomColor();
    
    // Default room
    let currentRoom = "general";
    socket.join(currentRoom);
    
    connectedUsers.set(socket.id, { roomId: currentRoom, color: userColor });
    
    // Initial sync
    socket.emit("history", getRoomHistory(currentRoom));
    socket.emit("room-joined", currentRoom);
    
    // Update user counts per room
    const emitUserCount = (room: string) => {
        const count = io.sockets.adapter.rooms.get(room)?.size || 0;
        io.to(room).emit("user-count", count);
    };
    emitUserCount(currentRoom);

    socket.on("join-room", (roomId) => {
        socket.leave(currentRoom);
        emitUserCount(currentRoom); // Update old room count

        socket.join(roomId);
        currentRoom = roomId;
        
        // Update user tracking
        const user = connectedUsers.get(socket.id);
        if (user) user.roomId = roomId;

        socket.emit("history", getRoomHistory(roomId));
        socket.emit("room-joined", roomId);
        emitUserCount(roomId); // Update new room count
    });

    socket.on("draw-line", (data) => {
        // Broadcast only to room
        socket.to(currentRoom).emit("draw-line", data);

        const history = getRoomHistory(currentRoom);
        const existingLine = history.find(l => l.id === data.id);

        if (!existingLine) {
            history.push(data);
            roomRedoStacks.set(currentRoom, []); 
        } else if (data.isFinished && data.endPoint) {
            existingLine.points = data.points;
            existingLine.endPoint = data.endPoint;
            existingLine.isFinished = true;
        }
    });

    socket.on("undo", () => {
        const history = getRoomHistory(currentRoom);
        const redoStack = getRoomRedoStack(currentRoom);

        if (history.length === 0) return;

        let lastFinishedIndex = -1;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i]!.isFinished) {
                lastFinishedIndex = i;
                break;
            }
        }

        if (lastFinishedIndex !== -1) {
            const [removedLine] = history.splice(lastFinishedIndex, 1);
            redoStack.push(removedLine!);
            io.to(currentRoom).emit("undo", history);
        }
    });

    socket.on("redo", () => {
        const history = getRoomHistory(currentRoom);
        const redoStack = getRoomRedoStack(currentRoom);

        if (redoStack.length === 0) return;
        
        const lineToRestore = redoStack.pop();
        if (lineToRestore) {
            history.push(lineToRestore);
            io.to(currentRoom).emit("redo", history); 
        }
    });

    socket.on("cursor-move", (x, y) => {
        const cursor: UserCursor = {
            userId: socket.id,
            x, y,
            color: userColor
        }
        socket.to(currentRoom).emit("cursor-update", cursor);
    });

    socket.on("clear", () => {
        roomHistories.set(currentRoom, []);
        roomRedoStacks.set(currentRoom, []);
        io.to(currentRoom).emit("clear");
    });

    socket.on("ping", (ts) => {
        socket.emit("pong", ts);
    });

    socket.on("disconnect", () => {
        connectedUsers.delete(socket.id);
        emitUserCount(currentRoom);
        io.to(currentRoom).emit("user-disconnected", socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});