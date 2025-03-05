import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import pkg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { 
    origin: 'http://localhost', // Указываем фронтенд через Nginx
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket.io/', // Указываем путь для Socket.IO
  transports: ['websocket', 'polling']
});

app.use('/audio', express.static('/app/audio')); // Путь в контейнере

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'chat_app',
  password: process.env.DB_PASSWORD || 'your_password',
  port: process.env.DB_PORT || 5432,
});

export const mockTranslate = (text, targetLang) => {
  const translations = {
    ru: { счастье: 'счастье' },
    en: { счастье: 'happiness' },
    es: { счастье: 'felicidad' },
    fr: { счастье: 'bonheur' },
  };
  return translations[targetLang]?.[text] || `${text} (переведено на ${targetLang})`;
};

export const saveMessage = async (originalText, translatedText, language, audioUrl = null, dbPool = pool) => {
  const query = `
    INSERT INTO messages (original_text, translated_text, language, audio_url)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const values = [originalText || '', translatedText || '', language, audioUrl];
  const result = await dbPool.query(query, values);
  return result.rows[0];
};

export const loadMessages = async (limit = 50, offset = 0, dbPool = pool) => {
  const query = 'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1 OFFSET $2;';
  const result = await dbPool.query(query, [limit, offset]);
  return result.rows.filter(msg => msg.translated_text || msg.audio_url);
};

export const saveAudio = async (audioBuffer) => {
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Audio buffer is empty or invalid');
  }
  const fileName = `audio_${Date.now()}.webm`;
  const filePath = path.join('/app/audio', fileName);
  await fs.mkdir('/app/audio', { recursive: true });
  await fs.writeFile(filePath, Buffer.from(audioBuffer));
  return `/audio/${fileName}`;
};

export const setupSocketIO = (ioInstance, dbPool = pool) => {
  ioInstance.on('connection', async (socket) => {
    console.log('Пользователь подключился:', socket.id);

    const messages = await loadMessages(50, 0, dbPool);
    socket.emit('chat history', messages);

    socket.on('chat message', async (msg) => {
      let translatedText, audioUrl = null;

      if (msg.text) {
        translatedText = mockTranslate(msg.text, msg.lang);
      } else if (msg.audio) {
        translatedText = '(голосовое сообщение)';
        try {
          audioUrl = await saveAudio(msg.audio);
        } catch (err) {
          console.error('Error saving audio:', err);
          return;
        }
      }

      const savedMessage = await saveMessage(msg.text, translatedText, msg.lang, audioUrl, dbPool);

      ioInstance.emit('chat message', {
        id: savedMessage.id,
        original: savedMessage.original_text || '',
        text: savedMessage.translated_text || '',
        lang: savedMessage.language,
        audio: savedMessage.audio_url,
        created_at: savedMessage.created_at,
      });
    });

    socket.on('typing', () => {
      socket.broadcast.emit('typing', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Пользователь отключился:', socket.id);
    });
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupSocketIO(io);
  server.listen(4000, () => {
    console.log('Сервер запущен на порту 4000');
  });
}