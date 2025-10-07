// server/index.js (обновлённый финальный вариант)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = {};

// Используем публичный LibreTranslate (временно)
const LIBRE_API = 'https://libretranslate.com';

async function translateText(text, sourceLang, targetLang) {
  try {
    const response = await axios.post(`${LIBRE_API}/translate`, {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    }, { timeout: 5000 });
    return response.data.translatedText || text;
  } catch (error) {
    console.error('Ошибка перевода:', error.message);
    return `[Ошибка перевода] ${text}`;
  }
}

function broadcastToSession(sessionId, message) {
  const session = sessions[sessionId];
  if (!session) return;
  [session.teacher, session.student].forEach(ws => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

function startTimer(sessionId) {
  const session = sessions[sessionId];
  if (!session || session.timer?.intervalId) return;
  session.timer = {
    startTime: Date.now(),
    pausedTime: 0,
    isRunning: true,
    intervalId: setInterval(() => {
      if (session.timer?.isRunning) {
        const elapsed = Date.now() - session.timer.startTime + session.timer.pausedTime;
        const seconds = Math.floor(elapsed / 1000);
        broadcastToSession(sessionId, { type: 'timer_update', seconds });
      }
    }, 1000)
  };
}

function pauseTimer(sessionId) {
  const session = sessions[sessionId];
  if (!session?.timer?.isRunning) return;
  session.timer.isRunning = false;
  session.timer.pausedTime += Date.now() - session.timer.startTime;
  clearInterval(session.timer.intervalId);
  session.timer.intervalId = null;
  const seconds = Math.floor(session.timer.pausedTime / 1000);
  broadcastToSession(sessionId, { type: 'timer_update', seconds });
}

function stopTimer(sessionId) {
  const session = sessions[sessionId];
  if (!session?.timer) return;
  if (session.timer.intervalId) clearInterval(session.timer.intervalId);
  delete session.timer;
  broadcastToSession(sessionId, { type: 'timer_update', seconds: 0 });
}

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const role = url.searchParams.get('role');
  const lang = url.searchParams.get('lang') || 'en';

  if (!sessionId || !role) {
    ws.close(4001, 'sessionId и role обязательны');
    return;
  }

  if (!sessions[sessionId]) {
    sessions[sessionId] = { teacher: null, student: null, studentLang: 'en', timer: null };
  }

  sessions[sessionId][role] = ws;
  if (role === 'teacher') sessions[sessionId].studentLang = lang;

  const session = sessions[sessionId];
  let currentTime = 0;
  if (session.timer) {
    const elapsed = session.timer.isRunning
      ? Date.now() - session.timer.startTime + session.timer.pausedTime
      : session.timer.pausedTime;
    currentTime = Math.floor(elapsed / 1000);
  }
  ws.send(JSON.stringify({ type: 'timer_update', seconds: currentTime }));

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'timer_command' && role === 'teacher') {
        switch (parsed.action) {
          case 'start': startTimer(sessionId); break;
          case 'pause': pauseTimer(sessionId); break;
          case 'stop': stopTimer(sessionId); break;
        }
        return;
      }
      if (parsed.text) {
        const session = sessions[sessionId];
        let translatedText = '';
        if (role === 'teacher') {
          translatedText = await translateText(parsed.text, 'ru', session.studentLang);
          if (session.student?.readyState === WebSocket.OPEN) {
            session.student.send(JSON.stringify({ type: 'message', role: 'teacher', original: parsed.text, translated: translatedText }));
          }
          ws.send(JSON.stringify({ type: 'message', role: 'teacher', original: parsed.text, translated: translatedText }));
        } else {
          translatedText = await translateText(parsed.text, session.studentLang, 'ru');
          if (session.teacher?.readyState === WebSocket.OPEN) {
            session.teacher.send(JSON.stringify({ type: 'message', role: 'student', original: parsed.text, translated: translatedText }));
          }
          ws.send(JSON.stringify({ type: 'message', role: 'student', original: parsed.text, translated: translatedText }));
        }
      }
    } catch (e) {
      console.error('Ошибка:', e);
    }
  });

  ws.on('close', () => {
    sessions[sessionId][role] = null;
  });
});

// Отдаём статику
app.use(express.static(path.join(__dirname, 'public')));

// SPA — все маршруты ведут к index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});