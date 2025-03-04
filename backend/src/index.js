import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import pkg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
});

app.use('/audio', express.static(path.join(__dirname, 'audio')));

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_app',
  password: 'your_password',
  port: 5432,
});

const mockTranslate = (text, targetLang) => {
  const translations = {
    ru: { счастье: 'счастье' },
    en: { счастье: 'happiness' },
    es: { счастье: 'felicidad' },
    fr: { счастье: 'bonheur' },
  };
  return translations[targetLang]?.[text] || `${text} (переведено на ${targetLang})`;
};

const saveMessage = async (originalText, translatedText, language, audioUrl = null) => {
  const query = `
    INSERT INTO messages (original_text, translated_text, language, audio_url)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const values = [originalText || '', translatedText || '', language, audioUrl];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const loadMessages = async (limit = 50, offset = 0) => {
  const query = 'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1 OFFSET $2;';
  const result = await pool.query(query, [limit, offset]);
  return result.rows.filter(msg => msg.translated_text || msg.audio_url);
};

const saveAudio = async (audioBuffer) => {
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Audio buffer is empty or invalid');
  }
  const fileName = `audio_${Date.now()}.webm`;
  const filePath = path.join(__dirname, 'audio', fileName);
  await fs.mkdir(path.join(__dirname, 'audio'), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(audioBuffer));
  console.log('Audio saved at:', filePath);
  return `/audio/${fileName}`;
};

io.on('connection', async (socket) => {
  console.log('Пользователь подключился:', socket.id);

  const messages = await loadMessages();
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

    const savedMessage = await saveMessage(msg.text, translatedText, msg.lang, audioUrl);

    io.emit('chat message', {
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

server.listen(4000, () => {
  console.log('Сервер запущен на порту 4000');
});