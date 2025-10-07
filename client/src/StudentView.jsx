// client/src/views/StudentView.jsx
import { useParams, useEffect, useState } from 'react-router-dom';
import { io } from 'socket.io-client';

export default function StudentView() {
  const { sessionId } = useParams();
  const [status, setStatus] = useState('Подключение...');

  useEffect(() => {
    // Подключаемся к WebSocket-серверу на том же хосте
    const socket = io({ 
      path: '/ws', 
      autoConnect: true,
      reconnection: true
    });

    socket.on('connect', () => {
      setStatus(`✅ Подключено к сессии: ${sessionId}`);
      // Присоединяемся к комнате сессии
      socket.emit('joinSession', { sessionId, role: 'student' });
    });

    socket.on('disconnect', () => {
      setStatus('❌ Отключено от сервера');
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🎓 Ученик</h1>
      <p><strong>ID сессии:</strong> {sessionId}</p>
      <p><strong>Статус:</strong> {status}</p>
      <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <p>Здесь будет чат и таймер...</p>
      </div>
    </div>
  );
}