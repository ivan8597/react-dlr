import React from 'react';

interface Message {
  id: string;
  original?: string;
  translated?: string;
  audio?: string;
  timestamp: string;
  language?: string;
  isVoice?: boolean;
}

interface ChatProps {
  messages: Message[];
}

const Chat: React.FC<ChatProps> = ({ messages }) => {
  return (
    <div className="chat">
      {messages.map((msg, index) => (
        <div key={index} className="message">
          {msg.isVoice ? (
            <div>
              <p><strong>{msg.id}:</strong> Voice Message</p>
              <audio controls>
                <source src={`data:audio/webm;base64,${msg.audio}`} type="audio/webm" />
              </audio>
            </div>
          ) : (
            <>
              <p><strong>{msg.id}:</strong> {msg.original}</p>
              <p className="translated">
                Translated ({msg.language}): {msg.translated}
              </p>
            </>
          )}
          <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
        </div>
      ))}
    </div>
  );
};

export default Chat;