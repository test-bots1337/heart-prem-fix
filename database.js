const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('bot.db');

// Промісифікація для зручності
db.runAsync = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

db.getAsync = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.allAsync = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Ініціалізація таблиць
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      category TEXT,
      text TEXT,
      photo TEXT,
      entities TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS required_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE,
      channel_name TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS premium_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      service_type TEXT,
      announcement_id INTEGER,
      duration INTEGER,
      status TEXT DEFAULT 'pending',
      payment_screenshot TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (announcement_id) REFERENCES announcements (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pinned_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER,
      user_id INTEGER,
      message_id INTEGER,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (announcement_id) REFERENCES announcements (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shop_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      product_type TEXT,
      amount INTEGER,
      price REAL,
      game_id TEXT,
      payment_screenshot TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS autopost_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER,
      user_id INTEGER,
      duration INTEGER,
      status TEXT DEFAULT 'active',
      last_posted DATETIME,
      expires_at DATETIME,
      notified_ending INTEGER DEFAULT 0,
      notified_last INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (announcement_id) REFERENCES announcements (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
});

module.exports = db;
