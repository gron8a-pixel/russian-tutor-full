#!/bin/bash
set -e  # завершить при любой ошибке

echo "Устанавливаем зависимости корня..."
npm install

echo "Собираем фронтенд..."
cd client
npm install
npm run build

echo "Сборка завершена!"