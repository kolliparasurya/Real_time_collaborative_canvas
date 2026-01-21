import {socket} from "./socket"
import {DrawLine, Point, UserCursor, Tool} from "../../shared/types"
import {v4 as uuidv4} from 'uuid'

export class CanvasManager {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private isDrawing = false;
    private currentStrokeId: string | null = null;
    private currentColor = "#000000";
    private currentWidth = 5;
    private currentTool: Tool = 'brush';

    private localPoints: Point[] = [];
    private history: DrawLine[] = [];
    private batch: Point[] = [];
    private batchTimeout: any = null;

    // Metrics
    private frameCount = 0;
    private fpsElement: HTMLElement | null = null;
    private latencyElement: HTMLElement | null = null;

    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.resize();

        window.addEventListener("resize", () => {
            this.resize()
            this.redrawAll(this.history);
        });

        // Mouse Events
        this.canvas.addEventListener("mousedown", this.startDrawing.bind(this));
        this.canvas.addEventListener("mousemove", this.handleMove.bind(this));
        this.canvas.addEventListener("mouseup", this.stopDrawing.bind(this));
        this.canvas.addEventListener("mouseout", this.stopDrawing.bind(this));

        // Touch Events (Mobile)
        this.canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const me = new MouseEvent("mousedown", { clientX: touch!.clientX, clientY: touch!.clientY });
            this.startDrawing(me);
        }, { passive: false });

        this.canvas.addEventListener("touchmove", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const me = new MouseEvent("mousemove", { clientX: touch!.clientX, clientY: touch!.clientY });
            this.handleMove(me);
        }, { passive: false });

        this.canvas.addEventListener("touchend", () => {
            const me = new MouseEvent("mouseup", {});
            this.stopDrawing();
        });

        this.setupSocketListeners();
        this.startMetrics();
        requestAnimationFrame(this.renderLoop.bind(this));
    }

    private resize(){
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight - 60;
    }

    public setTool(tool: Tool) {
        this.currentTool = tool;
        //if (tool === 'text') this.handleTextTool();
    }

    private handleTextTool() {
        const text = prompt("Enter text:");
        if (!text) return;
        
        const id = uuidv4();
        // Place text at center for simplicity
        const startPoint = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        
        const data: DrawLine = {
            id, userId: socket.id!, tool: 'text',
            color: this.currentColor, width: this.currentWidth,
            points: [], startPoint, text, isFinished: true
        };
        
        socket.emit("draw-line", data);
        this.history.push(data);
        this.redrawAll(this.history);
    }

    private startDrawing(e: MouseEvent){
        if (this.currentTool === 'text') {
            const text = prompt("Enter text to place here:");
            if (!text) return;

            const id = uuidv4();
            // FIX: Use the mouse click position!
            const startPoint = { x: e.offsetX, y: e.offsetY };
            
            const data: DrawLine = {
                id, 
                userId: socket.id!, 
                tool: 'text',
                color: this.currentColor, 
                width: this.currentWidth,
                points: [], 
                startPoint, 
                text, 
                isFinished: true
            };
            
            socket.emit("draw-line", data);
            this.history.push(data);
            this.redrawAll(this.history);
            return; // Exit early (don't start a line drawing)
        }
        this.isDrawing = true;
        this.currentStrokeId = uuidv4();
        this.batch = [];
        this.localPoints = [{x: e.offsetX, y: e.offsetY}];

        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.drawPath({
                id: this.currentStrokeId,
                userId: socket.id!,
                tool: this.currentTool,
                color: this.currentColor,
                width: this.currentWidth,
                points: this.localPoints,
                isFinished: false
            });
        }
    }

    private handleMove(e: MouseEvent){
        socket.emit("cursor-move", e.pageX, e.pageY);
        if(!this.isDrawing || !this.currentStrokeId) return;

        const currentPoint = {x: e.offsetX, y: e.offsetY};
        
        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.localPoints.push(currentPoint);
            this.batch.push(currentPoint);
            
            // Local draw for responsiveness
            this.drawPath({
                id: this.currentStrokeId, userId: 'me', tool: this.currentTool,
                color: this.currentColor, width: this.currentWidth,
                points: this.localPoints, isFinished: false
            });

            if(!this.batchTimeout){
                this.batchTimeout = setTimeout(() => {
                    if(this.batch.length > 0){
                        socket.emit("draw-line", {
                            id: this.currentStrokeId!,
                            userId: socket.id!,
                            tool: this.currentTool,
                            color: this.currentColor,
                            width: this.currentWidth,
                            points: this.batch,
                            isFinished: false
                        });
                        const lastPoint = this.batch[this.batch.length - 1];
                        this.batch = [lastPoint!];
                    }
                    this.batchTimeout = null;
                }, 30);
            }
        } else {
            // Shape Preview
            this.redrawAll(this.history);
            // Only assign startPoint if it exists and is a Point
            const previewData: DrawLine = {
                id: 'preview',
                userId: 'me',
                tool: this.currentTool,
                color: this.currentColor,
                width: this.currentWidth,
                points: [],
                startPoint: this.localPoints[0] as Point,
                endPoint: currentPoint,
                isFinished: false
            };
            this.drawPath(previewData);
            this.localPoints[1] = currentPoint; // Store end point
        }
    }

    private stopDrawing(){
        if(!this.isDrawing || !this.currentStrokeId) return;

        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.flushBatch();
            if(this.batchTimeout){
                clearTimeout(this.batchTimeout);
                this.batchTimeout = null;
            }
        }

        const endPoint = this.localPoints.length > 1 
            ? this.localPoints[this.localPoints.length - 1]! 
            : this.localPoints[0]!;

        const newStroke: DrawLine = {
            id: this.currentStrokeId!,
            userId: socket.id!,
            tool: this.currentTool,
            color: this.currentColor,
            width: this.currentWidth,
            points: this.localPoints,
            startPoint: this.localPoints[0]!, 
            endPoint: endPoint,
            isFinished: true
        }

        socket.emit("draw-line", newStroke);
        this.history.push(newStroke);

        this.batch = [];
        this.isDrawing = false;
        this.localPoints = [];
        this.currentStrokeId = null;
    }

    private flushBatch(){
        if(this.batch.length > 0){
            socket.emit("draw-line", {
                id: this.currentStrokeId!,
                points: this.batch,
                userId: socket.id!,
                tool: this.currentTool,
                color: this.currentColor,
                width: this.currentWidth,
                isFinished:false
            });
            const lastPoint = this.batch[this.batch.length - 1];
            this.batch = [lastPoint!];
        }
    }

    private drawPath(data: DrawLine){
        const { tool, points, color, width, startPoint, endPoint, text } = data;
        
        this.ctx.lineWidth = width;
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        this.ctx.beginPath();

        if (tool === 'brush' || tool === 'eraser') {
            if(points.length < 2) return;
            this.ctx.moveTo(points[0]!.x, points[0]!.y);
            for(let i = 1; i < points.length; i++){
                this.ctx.lineTo(points[i]!.x, points[i]!.y);
            }
            this.ctx.stroke();
        } else if (tool === 'rect' && startPoint && endPoint) {
            const w = endPoint.x - startPoint.x;
            const h = endPoint.y - startPoint.y;
            this.ctx.strokeRect(startPoint.x, startPoint.y, w, h);
        } else if (tool === 'circle' && startPoint && endPoint) {
            const r = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
            this.ctx.arc(startPoint.x, startPoint.y, r, 0, 2 * Math.PI);
            this.ctx.stroke();
        } else if (tool === 'text' && startPoint && text) {
            this.ctx.font = `${width * 5}px Arial`;
            this.ctx.fillText(text, startPoint.x, startPoint.y);
        }
    }

    private redrawAll(history: DrawLine[]){
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        history.forEach(stroke => this.drawPath(stroke));
    }

    // Persistence
    public saveSession() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.history));
        const anchor = document.createElement('a');
        anchor.href = dataStr;
        anchor.download = "canvas-session.json";
        anchor.click();
    }

    public loadSession(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                if (Array.isArray(json)) {
                    
                    // this.triggerClear(); 
                    json.forEach((line: DrawLine) => {
                        socket.emit("draw-line", line);
                        const exists = this.history.find(l => l.id === line.id);
                        if (!exists) {
                            this.history.push(line);
                            this.drawPath(line);
                        }
                    });
                }
            } catch (err) {
                console.error("Invalid session file", err);
            }
        };
        reader.readAsText(file);
    }

    private setupSocketListeners(){
        socket.on("draw-line", (newLine) => {
            this.history.push(newLine);
            this.drawPath(newLine); // Pass full object now
        });

        socket.on("history", (serverHistory) => {
            this.history = serverHistory;
            this.redrawAll(this.history);
        });

        socket.on("undo", (newHistory) => {
            this.history = newHistory;
            this.redrawAll(this.history);
        });

        socket.on("redo", (newHistory) => {
            this.history = newHistory;
            this.redrawAll(this.history);
        });

        socket.on("clear", ()=> {
            this.history = [];
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        });

        socket.on("cursor-update", (cursor) => this.updateCursorElement(cursor));

        socket.on("user-disconnected", (userId) => {
            const el = document.getElementById(`cursor-${userId}`);
            if(el) el.remove();
        });

        socket.on("user-count", (count) => {
            const el = document.getElementById("userCount");
            if(el) el.innerText = count.toString();
        });
        
        socket.on("pong", (ts) => {
            const latency = Date.now() - ts;
            if(this.latencyElement) this.latencyElement.innerText = `Ping: ${latency}ms`;
        });

        socket.on("room-joined", (roomId) => {
            console.log(`Joined room: ${roomId}`);

            const roomLabel = document.getElementById("currentRoomLabel");
            if(roomLabel){
                roomLabel.innerText = `(${roomId})`,
                roomLabel.style.color = "green";

                setTimeout(() => {roomLabel.style.color = "#666"}, 1000);
            }

            const statusMsg = document.getElementById("statusMessage");
            if(statusMsg) {
                statusMsg.innerText = `Successfully joined room: ${roomId}`;
                
                setTimeout(() => {
                    statusMsg.innerText = "Select a tool to start drawing.";
                }, 3000);
            }
        })
    }

    private updateCursorElement(cursor: UserCursor){
        let el = document.getElementById(`cursor-${cursor.userId}`);
        if(!el){
            el = document.createElement('div');
            el.id = `cursor-${cursor.userId}`;
            el.className = `user-cursor`;
            el.style.backgroundColor = cursor.color;
            const label = document.createElement('span');
            label.innerText = cursor.userId.slice(0, 4);
            el.appendChild(label);
            document.body.appendChild(el);
        }
        el.style.left = `${cursor.x}px`;
        el.style.top = `${cursor.y}px`;
    }

    private startMetrics() {
        this.fpsElement = document.getElementById("fps-counter");
        this.latencyElement = document.getElementById("latency-counter");

        setInterval(() => {
            if(this.fpsElement) this.fpsElement.innerText = `FPS: ${this.frameCount}`;
            this.frameCount = 0;
        }, 1000);

        setInterval(() => {
            socket.emit("ping", Date.now());
        }, 2000);
    }

    public setColor(color: string) { this.currentColor = color; }
    public setWidth(width: number) { this.currentWidth = width; }
    public triggerUndo() { socket.emit("undo"); }
    public triggerClear() { socket.emit("clear"); }
    public triggerRedo() { socket.emit("redo"); }

    private renderLoop() {
        this.frameCount++;
        requestAnimationFrame(this.renderLoop.bind(this));
    }
}