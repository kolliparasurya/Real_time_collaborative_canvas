import { CanvasManager } from "./canvas";
import { socket } from "./socket"; 
import "../style.css"

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("drawingCanvas") as HTMLCanvasElement;
    if (!canvas) return;
    const app = new CanvasManager(canvas);

    const safeListen = (id: string, evt: string, cb: (e: any) => void) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(evt, cb);
    };

    const statusMsg = document.getElementById("statusMessage");
    const setStatus = (msg: string) => {
        if(statusMsg) statusMsg.innerText = msg;
    };

    safeListen("colorPicker", "input", (e) => app.setColor((e.target as HTMLInputElement).value));
    safeListen("brushSize", "input", (e) => app.setWidth(parseInt((e.target as HTMLInputElement).value)));

    const tools = [
        { id: 'brushBtn', tool: 'brush', msg: "Brush: Draw freely." },
        { id: 'rectBtn', tool: 'rect', msg: "Rectangle: Drag to create a box." },
        { id: 'circleBtn', tool: 'circle', msg: "Circle: Drag to create a circle." },
        { id: 'textBtn', tool: 'text', msg: "Text: Click anywhere on the canvas to type." },
        { id: 'eraserBtn', tool: 'eraser', msg: " Eraser: Drag to remove." }
    ];

    tools.forEach(t => {
        const btn = document.getElementById(t.id);
        if(btn) {
            btn.addEventListener("click", () => {
                app.setTool(t.tool as any);
                setStatus(t.msg);
                
                if (t.tool === 'brush') {
                    const p = document.getElementById("colorPicker") as HTMLInputElement;
                    if(p) app.setColor(p.value);
                } else if (t.tool === 'eraser') {
                    app.setColor("#FFFFFF"); 
                }
                
                document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        }
    });

    safeListen("undoBtn", "click", () => { app.triggerUndo(); setStatus("Undo performed"); });
    safeListen("redoBtn", "click", () => { app.triggerRedo(); setStatus("Redo performed"); });
    safeListen("clearBtn", "click", () => { app.triggerClear(); setStatus("Canvas cleared"); });

    safeListen("joinRoomBtn", "click", () => {
        const input = document.getElementById("roomInput") as HTMLInputElement;
        if(input && input.value) {
            socket.emit("join-room", input.value);
            setStatus(`Joining room: ${input.value}...`);
        }
    });

    safeListen("saveBtn", "click", () => {
         app.saveSession();
         setStatus("Session saved!");
    });
    
    safeListen("loadInput", "change", (e) => {
        const input = e.target as HTMLInputElement;
        if(input.files?.[0]) {
            app.loadSession(input.files[0]);
            setStatus("Session loaded!");
        }
    });
});