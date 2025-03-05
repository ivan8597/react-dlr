import request from 'supertest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import ioClient from 'socket.io-client';
import { jest } from '@jest/globals';
import { app, setupSocketIO, mockTranslate, saveMessage, loadMessages, saveAudio } from '../src/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Отключаем предупреждения node-config
process.env.NODE_CONFIG_STRICT_MODE = '0';

jest.mock('pg', () => {
  const mockQuery = jest.fn();
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
    })),
  };
});

describe(' Чат бэкенд', () => {
  let server;
  let io;
  let clientSocket;
  let port;
  let mockPool;

  beforeAll(async () => {
    server = createServer(app);
    io = new Server(server, {
      cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
    });

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }), // По умолчанию пустой результат
    };
    setupSocketIO(io, mockPool);

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        clientSocket = ioClient(`http://localhost:${port}`);
        clientSocket.on('connect', resolve);
      });
    });
  });

  afterAll(async () => {
    clientSocket.close();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    jest.spyOn(fs, 'writeFile').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Socket.IO', () => {
    it('должен отправлять историю чата при подключении', (done) => {
      // Сначала настраиваем мок базы данных
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { 
            id: 1, 
            original_text: 'test', 
            translated_text: 'test (translated)', 
            language: 'en', 
            audio_url: null, 
            created_at: new Date() 
          }
        ]
      });

      // Создаем новое подключение для теста
      const newSocket = ioClient(`http://localhost:${port}`, {
        forceNew: true,
        transports: ['websocket']
      });

      // Ждем подключения перед тестированием
      newSocket.on('connect', () => {
        newSocket.on('chat history', (history) => {
          try {
            expect(history).toHaveLength(1);
            expect(history[0].original_text).toBe('test');
            newSocket.disconnect();
            done();
          } catch (error) {
            newSocket.disconnect();
            done(error);
          }
        });
      });

      // Обработка ошибок
      newSocket.on('connect_error', (error) => {
        newSocket.disconnect();
        done(error);
      });
    }, 15000);

    it('должен обрабатывать текстовое сообщение', (done) => {
      // Настраиваем мок для базы данных
      mockPool.query.mockResolvedValueOnce({
        rows: [{ 
          id: 2, 
          original_text: 'hello', 
          translated_text: 'hello (переведено на en)', 
          language: 'en', 
          audio_url: null, 
          created_at: new Date() 
        }]
      });

      // Подписываемся на событие перед отправкой
      clientSocket.once('chat message', (msg) => {
        try {
          expect(msg.original).toBe('hello');
          expect(msg.text).toBe('hello (переведено на en)');
          expect(msg.lang).toBe('en');
          done();
        } catch (error) {
          done(error);
        }
      });

      // Отправляем сообщение
      clientSocket.emit('chat message', { 
        text: 'hello', 
        lang: 'en',
        type: 'text'  // Добавляем тип сообщения
      });
    }, 10000);

    it('должен обрабатывать аудио сообщение', (done) => {
      const audioBuffer = Buffer.from('fake audio data');
      
      // Настраиваем моки
      mockPool.query.mockResolvedValueOnce({
        rows: [{ 
          id: 3, 
          original_text: '', 
          translated_text: '(голосовое сообщение)', 
          language: 'en', 
          audio_url: '/audio/audio_test.webm', 
          created_at: new Date() 
        }]
      });

      // Подписываемся на событие
      clientSocket.once('chat message', (msg) => {
        try {
          expect(msg.text).toBe('(голосовое сообщение)');
          expect(msg.audio).toBeTruthy();
          done();
        } catch (error) {
          done(error);
        }
      });

      // Отправляем сообщение
      clientSocket.emit('chat message', { 
        audio: audioBuffer, 
        lang: 'en',
        type: 'audio'  // Добавляем тип сообщения
      });
    });
  });

  describe('Функции', () => {
    it('должен переводить текст правильно', () => {
      expect(mockTranslate('счастье', 'en')).toBe('happiness');
      expect(mockTranslate('hello', 'es')).toBe('hello (переведено на es)');
    });

    it('должен сохранять сообщение в базу данных', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 4, original_text: 'test', translated_text: 'test (translated)', language: 'en', audio_url: null, created_at: new Date() }],
      });

      const result = await saveMessage('test', 'test (translated)', 'en', null, mockPool);
      expect(result.id).toBe(4);
      expect(result.original_text).toBe('test');
    });

    it('должен загружать сообщения из базы данных', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 5, original_text: 'old', translated_text: 'old (translated)', language: 'en', audio_url: null, created_at: new Date() }
        ],
      });

      const messages = await loadMessages(50, 0, mockPool);
      expect(messages).toHaveLength(1);
      expect(messages[0].original_text).toBe('old');
    });

    it('должен сохранять аудио файл', async () => {
      const audioUrl = await saveAudio(Buffer.from('test audio'));
      expect(audioUrl).toMatch(/\/audio\/audio_\d+\.webm/);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});