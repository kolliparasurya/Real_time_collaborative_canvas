/// <reference types="vite/client" />
import {io, Socket} from "socket.io-client"
import { ServerToClientEvents, ClientToServerEvents } from "../../shared/types"

const URL = import.meta.env.PROD ? import.meta.env.VITE_SERVER_URL : "http://localhost:3000"

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
    transports: ["websocket"]
});

socket.on( "connect", () => {
    console.log("Connected to server with ID:", socket.id);
});