# Real-Time Collaborative Canvas

This is a web-based whiteboard application that allows multiple users to draw, create shapes, and write text on a shared canvas in real-time. It uses WebSockets to sync data between clients instantly. I built this to understand how real-time data flow works and how to handle concurrent user inputs without freezing the browser.

Deployment link - https://real-time-collaborative-canvas-alpha.vercel.app/

[NOTE:- PLEASE WAIT FOR 1min AFTER OPENING THE LINK TO LOAD THE RENDER SERVER TO CONNECT WITH FRONTEND IN VERCEL]

## Setup Instructions

Prerequisites: You need Node.js installed on your machine.

1.  **Install Dependencies**
    Open your terminal in the project root and run:

    ```bash
    npm install
    ```

2.  **Run the Project**
    I set up a concurrent script so you don't need two terminals. Just run:

    ```bash
    npm run dev
    ```

    This will start the backend server on port 3000 and the Vite frontend (usually on port 5173).

3.  **Access the App**
    Open your browser and go to the link shown in the terminal (likely http://localhost:5173).

## How to Test with Multiple Users

1.  **Simulate Users:** Open the application in two different browser tabs or windows.
2.  **Real-Time Drawing:** Draw something in Tab A. It should appear instantly in Tab B.
3.  **Cursors:** Move your mouse in Tab A; you will see a colored cursor moving in Tab B labeled with your ID.
4.  **Rooms:**
    - In Tab A, type "room1" in the input box at the bottom and click "Join".
    - In Tab B, draw something. Tab A should NOT see it anymore (isolation).
    - In Tab B, join "room1". You will now sync with Tab A again and see the history of that room.
5.  **Mobile Test:** If your phone is on the same Wi-Fi, find your computer's IP address (e.g., 192.168.x.x) and navigate to `http://YOUR_IP:5173`. You can use touch gestures to draw.

## Features & Implementation Details

Here is how I implemented the specific requirements for this project:

### Frontend Features

- **Drawing Tools:** Implemented using the HTML5 Canvas API. The Brush and Eraser use `lineTo` for continuous strokes. The Eraser is technically just a brush with the color set to `#FFFFFF`.
- **Real-time Sync:** I used `socket.io` to broadcast drawing data. As soon as a user moves their mouse, points are batched and sent to the server, which immediately broadcasts them to other clients so they see the drawing unfold live, not just at the end.
- **User Indicators:** The app tracks mouse coordinates (`pageX`, `pageY`) and emits `cursor-move` events. Other clients render a `div` element with `position: absolute` to represent these cursors, assigning a random hex color to each user ID.
- **Conflict Resolution:** The server acts as the single source of truth. If two users draw in the same area, the server accepts both streams of data and appends them to the history array. The client simply renders whatever the server sends, layering the strokes based on timestamp order.
- **Undo/Redo:** This works globally per room. The server maintains a `drawingHistory` array and a `redoStack`. When a user clicks Undo, the server removes the last object from history, moves it to the redo stack, and tells all connected clients to re-render the canvas from scratch.
- **User Management:** The server counts the number of active sockets in a specific room using `io.sockets.adapter.rooms` and emits a `user-count` event whenever a user connects, disconnects, or switches rooms.

### Advanced Features

- **Mobile Touch Support:** I added event listeners for `touchstart`, `touchmove`, and `touchend`. I map these touch events to standard `MouseEvent` objects so the same drawing logic works on both desktop and mobile without duplicating code.
- **Room System:** I used Socket.io's `socket.join(roomId)` feature. The server uses Javascript `Map` objects (`roomHistories`, `roomRedoStacks`) to store drawing data separately for every room ID. This ensures data isolation.
- **Drawing Persistence:** I used the browser's `FileReader` API. Saving creates a JSON blob of the current history array. Loading parses this JSON and emits every line back to the server as if it were being drawn newly, effectively "playing back" the saved session.
- **Performance Metrics:**
  - **FPS:** I calculate this by counting how many times `requestAnimationFrame` fires per second.
  - **Latency:** I send a `ping` event with a timestamp. When the server replies with `pong`, I calculate `Date.now() - timestamp` to get the round-trip time in milliseconds.
- **Creative Features (Shapes & Text):**
  - **Shapes:** For Rectangles and Circles, I use a "preview" mode. While dragging, the canvas clears and redraws the shape constantly. Only on `mouseup` is the final shape sent to the server.
  - **Text:** I used the `prompt()` API to get input and `ctx.fillText` to render it at the click coordinates.

## Known Limitations

- **Network Jitter:** On very slow networks, curves might look slightly jagged because I am batching points every 30ms to prevent server overload.
- **Memory:** All drawing history is stored in the server's RAM (variables). If the server restarts, drawings are lost.
- **Text Tool:** The text tool is simple; once placed, text cannot be edited, only undone.

## Time Spent

I spent roughly 15-20 hours on this project.

- **Core setup (Socket.io + Canvas):** ~5 hours. Getting the batching logic right took the longest.
- **UI and Tools:** ~6 hours. Adding shapes and making the UI look decent.
- **Room Logic:** ~4 hours. Separating the global arrays into Maps was tricky.
- **Debugging/Polishing:** ~4 hours. Fixing the "redo" bug and ensuring mobile touch events mapped correctly.
