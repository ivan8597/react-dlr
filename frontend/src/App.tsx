import React, { useState, useEffect, useRef, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import './App.css';

interface Message {
  id: number;
  original: string;
  text: string;
  lang: string;
  audio?: string;
  created_at: string;
}

interface ServerToClientEvents {
  'chat history': (history: Message[]) => void;
  'chat message': (msg: Message) => void;
  'typing': (userId: string) => void;
}

interface ClientToServerEvents {
  'chat message': (msg: { text?: string; audio?: ArrayBuffer; lang: string }) => void;
  'typing': () => void;
}

// Подключаемся к бэкенду через Nginx
const socket = io('http://localhost', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'], // Разрешаем оба транспорта
  upgrade: true // Разрешаем upgrade до websocket
});

const useSocket = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState<string | null>(null);

  useEffect(() => {
    socket.on('chat history', (history: Message[]) => {
      setMessages(history.reverse().filter((msg: Message) => msg.text || msg.audio));
    });
    socket.on('chat message', (msg: Message) => {
      if (msg.text || msg.audio) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    socket.on('typing', (userId: string) => {
      setIsTyping(userId);
      setTimeout(() => setIsTyping(null), 2000);
    });

    return () => {
      socket.off('chat history');
      socket.off('chat message');
      socket.off('typing');
    };
  }, []);

  return { messages, setMessages, isTyping };
};

const App: React.FC = () => {
  const [message, setMessage] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const { messages, setMessages, isTyping } = useSocket();
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(() => {
    if (message.trim()) {
      socket.emit('chat message', { text: message, lang: language });
      setMessage('');
    }
  }, [message, language]);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
          console.log('Chunk size:', event.data.size);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          console.log('Blob size:', audioBlob.size);
          audioBlob.arrayBuffer().then((buffer) => {
            console.log('Buffer length:', buffer.byteLength);
            socket.emit('chat message', { audio: buffer, lang: language });
          }).catch(err => console.error('Buffer error:', err));
          setIsRecording(false);
          mediaRecorderRef.current = null;
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(1000);
        console.log('Запись началась');
      })
      .catch((err) => {
        console.error('Ошибка доступа к микрофону:', err);
        setIsRecording(false);
      });
  }, [language]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('Останавливаем запись');
      mediaRecorderRef.current.stop();
    } else {
      console.warn('MediaRecorder не активен или не инициализирован');
      setIsRecording(false);
    }
  }, []);

  const handleTyping = () => {
    socket.emit('typing');
  };

  const clearChat = () => setMessages([]);

  return (
    <div className="App">
      <div className="chat-container">
        <h1 className="text-2xl font-bold mb-4">Чат с переводом</h1>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mb-4 w-full"
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="ru">Русский</option>
        </select>
        <div ref={chatBoxRef} className="chat-box">
          {messages.map((msg) => (
            <div key={msg.id} className="mb-2">
              {msg.audio ? (
                <div>
                  <audio controls src={msg.audio} className="max-w-full" />
                  <small className="text-gray-500">({msg.lang})</small>
                </div>
              ) : (
                <p className="bg-white p-2 rounded shadow">
                  {msg.text}
                  {msg.original && msg.original !== msg.text && (
                    <small className="text-gray-500">
                      {' '}
                      (Оригинал: {msg.original}, {msg.lang})
                    </small>
                  )}
                </p>
              )}
            </div>
          ))}
          {isTyping && <p className="text-gray-400 italic">Кто-то печатает...</p>}
        </div>
        <div className="flex">
          <input
            type="text"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              handleTyping();
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) sendMessage();
            }}
            className="flex-1"
            placeholder="Введите сообщение..."
          />
          <button onClick={sendMessage} className="bg-blue-500 hover:bg-blue-600">
            Отправить
          </button>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {isRecording ? 'Остановить' : 'Записать'}
          </button>
          <button onClick={clearChat} className="bg-gray-500 hover:bg-gray-600">
            Очистить
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;