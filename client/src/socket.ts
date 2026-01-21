import {io, Socket} from "socket.io-client"
import { ServerToClientEvents, ClientToServerEvents } from "../../shared/types"

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io("http://localhost:3000");

socket.on( "connect", () => {
    console.log("Connected to server with ID:", socket.id);
});