import {defineConfig} from 'vite';
import path from 'path';

export default defineConfig({
    root: 'client',
    publicDir: '../public',
    build:{
        outDir: '../dist/client',
        emptyOutDir: true,
    },
    server:{
        port: 5173
    }
});