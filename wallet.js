const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../db/database.sqlite'));

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    amount REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Sign up
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hash], function (err) {
    if (err) return res.status(400).json({ error: 'Username already exists' });
    res.json({ success: true });
  });
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ success: true, userId: user.id, balance: user.balance });
  });
});

// Deposit
router.post('/deposit', (req, res) => {
  const { userId, amount } = req.body;

  db.serialize(() => {
    db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, userId]);
    db.run(`INSERT INTO transactions (user_id, type, amount) VALUES (?, 'deposit', ?)`, [userId, amount]);
    db.get(`SELECT balance FROM users WHERE id = ?`, [userId], (err, row) => {
      res.json({ success: true, newBalance: row.balance });
    });
  });
});

// Withdraw
router.post('/withdraw', (req, res) => {
  const { userId, amount } = req.body;

  db.get(`SELECT balance FROM users WHERE id = ?`, [userId], (err, row) => {
    if (row.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

    db.serialize(() => {
      db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amount, userId]);
      db.run(`INSERT INTO transactions (user_id, type, amount) VALUES (?, 'withdraw', ?)`, [userId, amount]);
      db.get(`SELECT balance FROM users WHERE id = ?`, [userId], (err, row2) => {
        res.json({ success: true, newBalance: row2.balance });
      });
    });
  });
});

// Get transaction history
router.get('/history/:userId', (req, res) => {
  db.all(`SELECT type, amount, timestamp FROM transactions WHERE user_id = ? ORDER BY timestamp DESC`, [req.params.userId], (err, rows) => {
    res.json(rows);
  });
});

module.exports = router;
