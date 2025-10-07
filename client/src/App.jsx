// src/App.jsx
import { useState, useEffect, useRef } from 'react';

function generateSessionId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'rt-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  const initialParams = new URLSearchParams(window.location.search);
  let initialRole = initialParams.get('role') || 'teacher';
  let initialSessionId = initialParams.get('sessionId');
  let initialLang = initialParams.get('lang') || 'en';

  if (initialRole === 'teacher' && !initialSessionId) {
    initialSessionId = generateSessionId();
    const newUrl = `${window.location.pathname}?role=teacher&sessionId=${initialSessionId}&lang=${initialLang}`;
    window.history.replaceState({}, '', newUrl);
  }

  const [role] = useState(initialRole);
  const [sessionId] = useState(initialSessionId);
  const [studentLang, setStudentLang] = useState(initialLang);
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState([]);
  const [ws, setWs] = useState(null);
  const [status, setStatus] = useState('Подключение...');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [error, setError] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    const socket = new WebSocket(`wss://russian-tutor-server.onrender.com?...`);
    setWs(socket);

    socket.onopen = () => setStatus('Онлайн');
    
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'timer_update') {
        setTimerSeconds(msg.seconds);
      } 
      else if (msg.type === 'message') {
        setHistory(prev => [...prev, msg]);
      }
      else if (msg.type === 'webrtc_signal') {
        handleSignal(msg.signal, msg.from);
      }
    };

    socket.onerror = () => setStatus('Ошибка подключения');
    
    return () => socket.close();
  }, [sessionId, role, studentLang]);

  // === WebRTC ===
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
        setIsVideoActive(true);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'webrtc_signal',
            signal: { type: 'candidate', candidate: event.candidate }
          }));
        }
      };

      if (role === 'teacher') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: 'webrtc_signal',
          signal: { type: 'offer', sdp: offer.sdp }
        }));
      }
    } catch (err) {
      setError('Ошибка камеры: ' + err.message);
    }
  };

  const handleSignal = async (signal, from) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      if (signal.type === 'offer' && role === 'student') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({
          type: 'webrtc_signal',
          signal: { type: 'answer', sdp: answer.sdp }
        }));
      }
      else if (signal.type === 'answer' && role === 'teacher') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      }
      else if (signal.type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      setError('Ошибка WebRTC: ' + err.message);
    }
  };

  // === Чат ===
  const handleSend = () => {
    if (!inputText.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ text: inputText }));
    setInputText('');
  };

  const handleLangChange = (newLang) => {
    setStudentLang(newLang);
    const newUrl = `${window.location.pathname}?role=teacher&sessionId=${sessionId}&lang=${newLang}`;
    window.history.replaceState({}, '', newUrl);
  };

  const sendTimerCommand = (action) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'timer_command', action }));
    }
  };

  const studentLink = role === 'teacher'
    ? `http://localhost:3000?role=student&sessionId=${sessionId}&lang=${studentLang}`
    : null;

  return (
    <div style={{ padding: '15px', fontFamily: 'Arial', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>
        {role === 'teacher' ? '👩‍🏫 Учитель' : '🧑‍🎓 Ученик'}
        <span style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
          ({status}) • Сессия: <code>{sessionId}</code>
        </span>
      </h1>

      {/* Видео */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: '5px 0' }}>Моя камера</h4>
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            style={{ width: '320px', height: '200px', border: '1px solid #999', backgroundColor: '#000', borderRadius: '4px' }}
          />
        </div>
        {isVideoActive && (
          <div>
            <h4 style={{ margin: '5px 0' }}>Собеседник</h4>
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              style={{ width: '320px', height: '200px', border: '1px solid #999', backgroundColor: '#000', borderRadius: '4px' }}
            />
          </div>
        )}
      </div>

      {error && <div style={{ color: 'red', marginBottom: '10px', padding: '8px', backgroundColor: '#ffebee', borderRadius: '4px' }}>{error}</div>}

      {/* Кнопка видеосвязи */}
      {role === 'teacher' && !isVideoActive && (
        <div style={{ marginBottom: '20px' }}>
          <button 
            onClick={startVideoCall}
            style={{ padding: '10px 20px', backgroundColor: '#E91E63', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}
          >
            📹 Начать видеосвязь
          </button>
        </div>
      )}

      {/* Таймер */}
      <div style={{ 
        textAlign: 'center', 
        padding: '12px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '8px', 
        marginBottom: '20px',
        fontSize: '22px',
        fontWeight: 'bold',
        color: '#333'
      }}>
        🕒 {formatTime(timerSeconds)}
      </div>

      {/* Управление таймером */}
      {role === 'teacher' && (
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <button 
            onClick={() => sendTimerCommand('start')}
            style={{ padding: '8px 16px', margin: '0 5px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            ▶️ Старт
          </button>
          <button 
            onClick={() => sendTimerCommand('pause')}
            style={{ padding: '8px 16px', margin: '0 5px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            ⏸️ Пауза
          </button>
          <button 
            onClick={() => sendTimerCommand('stop')}
            style={{ padding: '8px 16px', margin: '0 5px', backgroundColor: '#F44336', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            ⏹️ Стоп
          </button>
        </div>
      )}

      {/* Язык и ссылка */}
      {role === 'teacher' && (
        <div style={{ marginBottom: '15px' }}>
          <label>
            Язык ученика:
            <select 
              value={studentLang}
              onChange={(e) => handleLangChange(e.target.value)}
              style={{ marginLeft: '8px', padding: '4px' }}
            >
              <option value="en">Английский</option>
              <option value="es">Испанский</option>
              <option value="fr">Французский</option>
              <option value="ar">Арабский</option>
              <option value="zh">Китайский</option>
              <option value="de">Немецкий</option>
              <option value="pt">Португальский</option>
              <option value="tr">Турецкий</option>
              <option value="hi">Хинди</option>
              <option value="ja">Японский</option>
            </select>
          </label>
        </div>
      )}

      {studentLink && (
        <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '6px' }}>
          <strong>🔗 Уникальная ссылка для ученика:</strong><br />
          <input 
            type="text" 
            value={studentLink} 
            readOnly 
            style={{ width: '100%', padding: '6px', marginTop: '6px', fontSize: '14px' }}
            onClick={(e) => e.target.select()}
          />
          <button 
            onClick={() => navigator.clipboard.writeText(studentLink)}
            style={{ marginTop: '6px', padding: '6px 10px', fontSize: '13px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            📋 Копировать ссылку
          </button>
        </div>
      )}

      {/* Чат */}
      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', backgroundColor: role === 'teacher' ? '#f1f8e9' : '#e3f2fd', marginBottom: '20px' }}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={role === 'teacher' ? 'Напишите на русском...' : `Напишите на ${studentLang}...`}
          rows="2"
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <button 
          onClick={handleSend}
          disabled={!inputText.trim()}
          style={{ padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          ➡️ Отправить
        </button>
      </div>

      {/* История */}
      <div>
        <h3>💬 Диалог</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', borderRadius: '4px', backgroundColor: '#fafafa' }}>
          {history.length === 0 ? (
            <p style={{ color: '#999' }}>Диалог пока пуст</p>
          ) : (
            history.map((msg, i) => (
              <div key={i} style={{ marginBottom: '10px', padding: '8px', backgroundColor: msg.role === 'teacher' ? '#e8f5e9' : '#e3f2fd', borderRadius: '4px' }}>
                <strong>{msg.role === 'teacher' ? 'Учитель:' : 'Ученик:'}</strong> {msg.original}<br />
                <em>→ Перевод: {msg.translated}</em>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;