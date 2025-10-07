const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs'); // ← добавлено для проверки

// Инициализация Express
const app = express();

const PUBLIC_DIR = path.join(__dirname, 'public');

// 🔍 Проверка: существует ли папка public и index.html?
if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('❌ Папка public не найдена! Запустите сначала сборку фронтенда (npm run build).');
  process.exit(1);
}

const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
if (!fs.existsSync(INDEX_PATH)) {
  console.error('❌ Файл public/index.html не найден! Сборка фронтенда не выполнена.');
  process.exit(1);
}

console.log('✅ Найден index.html, размер:', fs.statSync(INDEX_PATH).size, 'байт');

// Раздача статических файлов
app.use(express.static(PUBLIC_DIR, {
  etag: false,        // отключить кэширование на Render (для отладки)
  lastModified: false
}));

// SPA fallback: только если файл не найден И это не API-запрос
app.get('*', (req, res) => {
  // Не перехватываем запросы к явным файлам (например, /assets/...)
  // Но express.static уже обработал их, так что сюда попадают только "не найденные"
  res.sendFile(INDEX_PATH);
});

// HTTP-сервер
const server = http.createServer(app);

// WebSocket-сервер
const wss = new WebSocket.Server({ noServer: true });

// Обработка upgrade для WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Хранилище сессий
const sessions = {};

wss.on('connection', (ws, req) => {
  console.log('🔌 Новое WebSocket-соединение');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const { type, sessionId } = message;

      if (!sessionId) {
        return ws.send(JSON.stringify({ type: 'error', message: 'sessionId обязателен' }));
      }

      // Создаём сессию при первом обращении
      if (!sessions[sessionId]) {
        sessions[sessionId] = { teacher: null, students: [] };
      }

      if (type === 'join') {
        const { role } = message;
        ws.sessionId = sessionId;
        ws.role = role;

        if (role === 'teacher') {
          sessions[sessionId].teacher = ws;
        } else if (role === 'student') {
          sessions[sessionId].students.push(ws);
        }

        ws.send(JSON.stringify({ type: 'joined', sessionId, role }));
        console.log(`👤 ${role} присоединился к сессии ${sessionId}`);
      }

      else if (type === 'chat') {
        const { text, senderRole } = message;
        const session = sessions[sessionId];
        if (!session) return;

        const recipients = [session.teacher, ...session.students].filter(Boolean);
        const payload = JSON.stringify({
          type: 'chat',
          text,
          senderRole,
          timestamp: new Date().toISOString()
        });

        recipients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }

      else if (type === 'timer') {
        const { action } = message;
        const session = sessions[sessionId];
        if (!session || ws !== session.teacher) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Только учитель может управлять таймером' }));
        }

        const recipients = [session.teacher, ...session.students].filter(Boolean);
        const payload = JSON.stringify({ type: 'timer', action });
        recipients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
    } catch (err) {
      console.error('❌ Ошибка обработки сообщения:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Неверный формат сообщения' }));
    }
  });

  ws.on('close', () => {
    // Опционально: удалить ws из сессии
    if (ws.sessionId && sessions[ws.sessionId]) {
      const session = sessions[ws.sessionId];
      if (session.teacher === ws) {
        session.teacher = null;
      } else {
        session.students = session.students.filter(s => s !== ws);
      }
      console.log(`🔌 ${ws.role} отключился от сессии ${ws.sessionId}`);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket ошибка:', err.message);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ HTTP + WebSocket сервер запущен на порту ${PORT}`);
  console.log(`📁 Раздача статики из: ${PUBLIC_DIR}`);
});