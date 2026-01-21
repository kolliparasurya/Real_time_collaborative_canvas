export type Point = { x: number; y: number};

export type Tool = 'brush' | 'eraser' | 'rect' | 'circle' | 'text';

export interface DrawLine{
    id: string;
    userId: string;
    color: string;
    width: number;
    points: Point[];
    isFinished: boolean;
    tool: Tool;
    startPoint?: Point;
    endPoint?: Point;
    text?: string;
}

export interface UserCursor{
    userId: string;
    x: number;
    y: number;
    color: string;
}

export interface ServerToClientEvents {
    "history": (history: DrawLine[]) => void;
    "draw-line": (data: DrawLine) => void;
    "undo": (newHistory: DrawLine[]) => void;
    "cursor-update": (cursor: UserCursor) => void;
    "user-count": (count: number) => void;
    "clear": () => void;
    "user-disconnected": (userId: string) => void;
    "redo": (newHistory: DrawLine[]) => void;
    "room-joined": (roomId: string) => void;
    "pong": (timestamp: number) => void;
}

export interface ClientToServerEvents {
    "draw-line": (data: DrawLine) => void;
    "undo": () => void;
    "cursor-move": (x: number, y: number) => void;
    "clear": () => void;
    "redo": () => void;
    "join-room": (roomId: string) => void;
    "ping": (timestamp: number) => void;
}