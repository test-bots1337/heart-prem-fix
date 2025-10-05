const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('bot.db');

console.log('🔄 Начало миграции базы данных...');

// Добавление колонки entities в таблицу announcements если она не существует
db.run(`
  ALTER TABLE announcements ADD COLUMN entities TEXT
`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('❌ Ошибка добавления колонки entities:', err.message);
  } else if (err && err.message.includes('duplicate column name')) {
    console.log('✅ Колонка entities уже существует');
  } else {
    console.log('✅ Добавлена колонка entities в таблицу announcements');
  }
});

// Добавление колонки status в таблицу pinned_posts если она не существует
db.run(`
  ALTER TABLE pinned_posts ADD COLUMN status TEXT DEFAULT 'active'
`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('❌ Ошибка добавления колонки status в pinned_posts:', err.message);
  } else if (err && err.message.includes('duplicate column name')) {
    console.log('✅ Колонка status уже существует в pinned_posts');
  } else {
    console.log('✅ Добавлена колонка status в таблицу pinned_posts');
  }
});

// Обновление существующих pinned_posts для установки статуса 'active'
db.run(`
  UPDATE pinned_posts SET status = 'active' WHERE status IS NULL
`, (err) => {
  if (err) {
    console.error('❌ Ошибка обновления статуса pinned_posts:', err.message);
  } else {
    console.log('✅ Обновлен статус существующих pinned_posts');
  }
});

// Закрытие соединения с базой данных
db.close((err) => {
  if (err) {
    console.error('❌ Ошибка закрытия базы данных:', err.message);
  } else {
    console.log('✅ Миграция базы данных завершена успешно');
  }
});
