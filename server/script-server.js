import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'

import { createClient } from '@libsql/client'
import { PORT } from './config.js'
import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config()

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = createClient({
    url: "libsql://central-the-wasp-jth6.turso.io",
    authToken: process.env.DB_TOKEN
})

await db.execute(
    `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
    )`
)

await db.execute(
    `CREATE TABLE IF NOT EXISTS users (
    uid INTEGER PRIMARY KEY UNIQUE,
    user TEXT UNIQUE,
    password TEXT
    )`
)

io.on('connection', async (socket) => {
    console.log('a user has connected!');
    const currentUser = socket.handshake.auth.username
    socket.emit('current user', currentUser);

    socket.on('connect_error', (err) => {
        console.error('Error de conexión:', err);
    });

    socket.on('disconnect', () => {
        console.log('an user has disconnected');
    })

    socket.on('chat message', async (msg) => {
        let result
        const username = socket.handshake.auth.username ?? 'Anonymous'
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
                args: { msg, username }
            })
        } catch (e) {
            console.error(e)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
    });

    if (!socket.recovered) {
        try {
            const results = await db.execute({
                sql: 'SELECT * FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })

            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.user, currentUser)
            })
        } catch (e) {
            console.error(e)
        }
    }

    socket.on('login', async ({ user, password }) => {
        try {
            const resultadoUser = await db.execute(`SELECT user, password FROM users WHERE user = ?`, [user]);
            const rows = resultadoUser.rows || resultadoUser;

            if (!Array.isArray(rows) || rows.length === 0) {
                socket.emit('loginResponse', { success: false, message: 'Usuario no encontrado' });
                return;
            }

            const userInfo = rows[0];
            
            if (bcrypt.compare(password, userInfo.password)) {
                socket.emit('loginResponse', { success: true, message: 'Login exitoso' });
            } else {
                socket.emit('loginResponse', { success: false, message: 'Credenciales incorrectas' });
            }

        } catch (error) {
            console.error('Error en el servidor:', error);
            socket.emit('loginResponse', { success: false, message: 'Error del servidor' });
        }
    });
});

app.use(logger('dev'));

app.use(express.static(process.cwd() + '/client'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'login.html'));
});

app.get('/inicio', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

server.listen( PORT, () => {
    console.log(`Server running on port ${PORT}`);
});