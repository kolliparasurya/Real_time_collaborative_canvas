# System Architecture

This document outlines the technical design, data flow, and architectural decisions behind the Collaborative Canvas application. The system uses a Client-Server architecture powered by Node.js and Socket.io to enable real-time bidirectional communication.

## Data Flow Diagram

The application relies on an optimistic UI update model where the client draws locally first for zero latency, then synchronizes with the server.

```text
       USER A (Client)                     SERVER (Node.js)                      USER B (Client)
             |                                     |                                     |
1. INPUT: Mousedown/Touch                          |                                     |
             |                                     |                                     |
2. ACTION: Draw Locally (Immediate)                |                                     |
             |                                     |                                     |
3. BUFFER: Push points to Batch                    |                                     |
             |                                     |                                     |
4. TIMER: 30ms Batch Interval Fires                |                                     |
   Packet: { points: [...], isFinished: false }    |                                     |
             | ----------------------------------> |                                     |
                                           5. PROCESS: Receive Data                      |
                                           6. BROADCAST: Forward to Room                 |
                                                   | ----------------------------------> |
                                                                               7. UPDATE: Receive 'draw-line'
                                                                               8. RENDER: Draw segment on Canvas
             |                                     |                                     |
9. FINISH: Mouseup                                 |                                     |
   Packet: { points: [ALL], isFinished: true }     |                                     |
             | ----------------------------------> |                                     |
                                           10. COMMIT: Update 'roomHistories'            |
                                               (Source of Truth)                         |
```

## WebSocket Protocol

I used Socket.io events to manage the state.

### Client -> Server

- `draw-line`: Sends an object containing the tool type, color, width, and an array of points. It also includes a `isFinished` boolean.
- `cursor-move`: Sends x and y coordinates (rate-limited by mousemove events).
- `undo` / `redo`: Requests a state change for the current room.
- `join-room`: Requests to switch the socket channel.
- `clear`: Requests to wipe the room's history.
- `ping`: Used to calculate latency.

### Server -> Client

- `history`: Sends the entire array of line objects (used when joining a room).
- `draw-line`: Forwards drawing data to other clients.
- `cursor-update`: Broadcasts another user's position.
- `undo` / `redo`: Broadcasts the new full history array after a state change.

## Undo/Redo Strategy

I implemented a global server-side history stack.

- **Storage:** The server keeps two Maps: `roomHistories` and `roomRedoStacks`.
- **Logic:**
  - When a user draws a new line, the `roomRedoStacks` for that room is emptied. This effectively strictly enforces a linear timeline and prevents branching conflicts.
  - **Undo:** The server pops the last "finished" stroke from the history array and pushes it onto the redo stack. It then sends the _entire_ updated history to all clients to trigger a full redraw.
  - **Redo:** The server pops from the redo stack, pushes back to history, and broadcasts.

## Performance Decisions

1.  **Batching:**
    The biggest performance bottleneck in drawing apps is sending a socket message for every single pixel or mouse event (which can fire 100+ times a second).
    - _Decision:_ I implemented a `batch` array in `canvas.ts`. It collects points and only emits them every 30ms. This drastically reduces network traffic.

2.  **RequestAnimationFrame:**
    The render loop uses `requestAnimationFrame` instead of `setInterval`. This ensures the canvas only updates when the screen is ready to refresh, preventing screen tearing and saving battery on mobile devices.

3.  **Map vs Array for Rooms:**
    Instead of one global array, I used `Map<string, DrawLine[]>` on the server. This allows for O(1) access to room data, meaning the app won't slow down just because there are many different active rooms.

## Conflict Resolution

Since this is a freehand drawing tool, "hard" conflicts (like two people editing the same text character) are rare. The main conflict is overlapping lines.

- **Strategy:** "Last Write Wins" / Append Only.
- The server blindly accepts points from clients. If User A and User B draw over the same spot at the exact same time, the server simply broadcasts both.
- The order of rendering on the client is determined by the order in the `history` array.
- **History Integrity:** To prevent a laggy client from corrupting the history database, the server only updates the permanent "Source of Truth" history when the client sends the final `isFinished: true` packet. Intermediate packets are broadcasted but not saved to the permanent record.
