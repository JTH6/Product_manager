import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config()
const port = process.env.PORT ?? 3000;
const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

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



io.on('connection', async (socket) => {
    console.log('a user has connected!');
    const currentUser = socket.handshake.auth.username
    socket.emit('current user', currentUser)


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
});



app.use(logger('dev'));

app.use(express.static(process.cwd() + '/client'));

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});