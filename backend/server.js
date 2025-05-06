const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize SQLite DB
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite database.');
});

// Create users table if not exists
db.run(`CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  balance REAL DEFAULT 0
)`);

// Create transactions table for history tracking
db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  type TEXT,
  amount REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(username) REFERENCES users(username)
)`);

// Create withdrawal_requests table
db.run(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  amount REAL,
  request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  FOREIGN KEY(username) REFERENCES users(username)
)`);

// Create deposit_requests table
db.run(`CREATE TABLE IF NOT EXISTS deposit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  amount REAL,
  request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  reference_id TEXT,
  admin_notes TEXT,
  FOREIGN KEY(username) REFERENCES users(username)
)`);

// Middleware to validate request data
const validateUserInput = (req, res, next) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }
  
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: "Invalid input type" });
  }
  
  next();
};

// Middleware to validate amount
const validateAmount = (req, res, next) => {
  const { amount } = req.body;
  
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "Valid amount is required" });
  }
  
  next();
};

// Signup route
app.post('/signup', validateUserInput, (req, res) => {
  const { username, password } = req.body;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (err) {
      console.error("Database error during signup check:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (row) return res.status(400).json({ message: "User already exists" });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run("INSERT INTO users (username, password, balance) VALUES (?, ?, 0)", [username, hashedPassword], (err) => {
        if (err) {
          console.error("Database error during signup insert:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({ message: "Signup successful" });
      });
    } catch (error) {
      console.error("Error hashing password:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
});

// Login route
app.post('/login', validateUserInput, (req, res) => {
  const { username, password } = req.body;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      console.error("Database error during login:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (!user) return res.status(400).json({ message: "User not found" });

    try {
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Incorrect password" });

      res.json({ message: "Login successful", balance: user.balance });
    } catch (error) {
      console.error("Error comparing passwords:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
});

// Deposit request route (not immediate deposit)
app.post('/deposit', validateAmount, (req, res) => {
  const { username, amount, reference_id } = req.body;
  
  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }

  // Create deposit request instead of immediately updating balance
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error("Error checking user:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Store the deposit request
    db.run("INSERT INTO deposit_requests (username, amount, status, reference_id) VALUES (?, ?, 'pending', ?)", 
      [username, amount, reference_id || ''], function(err) {
        if (err) {
          console.error("Error creating deposit request:", err);
          return res.status(500).json({ message: "Failed to create deposit request" });
        }
        
        res.json({ 
          message: "Deposit request submitted. Pending verification.", 
          request_id: this.lastID,
          current_balance: user.balance
        });
      }
    );
  });
});

// Request withdrawal route
app.post('/request-withdrawal', validateAmount, (req, res) => {
  const { username, amount } = req.body;
  
  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }

  db.get("SELECT balance FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error("Error checking balance:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient funds" });
    }
    
    // Create withdrawal request
    db.run("INSERT INTO withdrawal_requests (username, amount, status) VALUES (?, ?, 'pending')", 
      [username, amount], function(err) {
        if (err) {
          console.error("Error creating withdrawal request:", err);
          return res.status(500).json({ message: "Failed to create withdrawal request" });
        }
        
        res.json({ 
          message: "Withdrawal request submitted successfully", 
          request_id: this.lastID 
        });
      }
    );
  });
});

// Get transaction history route
app.get('/history/:username', (req, res) => {
  const { username } = req.params;
  
  db.all("SELECT type, amount, timestamp FROM transactions WHERE username = ? ORDER BY timestamp DESC LIMIT 20", 
    [username], (err, rows) => {
      if (err) {
        console.error("Error fetching transaction history:", err);
        return res.status(500).json({ message: "Failed to fetch transaction history" });
      }
      
      res.json({ transactions: rows });
    }
  );
});

// Get pending withdrawals route
app.get('/pending-withdrawals/:username', (req, res) => {
  const { username } = req.params;
  
  db.all("SELECT * FROM withdrawal_requests WHERE username = ? ORDER BY request_date DESC", 
    [username], (err, rows) => {
      if (err) {
        console.error("Error fetching withdrawal requests:", err);
        return res.status(500).json({ message: "Failed to fetch withdrawal requests" });
      }
      
      res.json({ requests: rows });
    }
  );
});

// Get pending deposits route
app.get('/pending-deposits/:username', (req, res) => {
  const { username } = req.params;
  
  db.all("SELECT * FROM deposit_requests WHERE username = ? ORDER BY request_date DESC", 
    [username], (err, rows) => {
      if (err) {
        console.error("Error fetching deposit requests:", err);
        return res.status(500).json({ message: "Failed to fetch deposit requests" });
      }
      
      res.json({ requests: rows });
    }
  );
});

// ADMIN ROUTES - These would typically be protected with admin authentication

// Get all pending withdrawal requests (admin only)
app.get('/admin/pending-withdrawals', (req, res) => {
  db.all("SELECT * FROM withdrawal_requests WHERE status = 'pending' ORDER BY request_date ASC", 
    [], (err, rows) => {
      if (err) {
        console.error("Error fetching pending withdrawals:", err);
        return res.status(500).json({ message: "Failed to fetch pending withdrawals" });
      }
      
      res.json({ requests: rows });
    }
  );
});

// Get all pending deposit requests (admin only)
app.get('/admin/pending-deposits', (req, res) => {
  db.all("SELECT * FROM deposit_requests WHERE status = 'pending' ORDER BY request_date ASC", 
    [], (err, rows) => {
      if (err) {
        console.error("Error fetching pending deposits:", err);
        return res.status(500).json({ message: "Failed to fetch pending deposits" });
      }
      
      res.json({ requests: rows });
    }
  );
});

// Approve or reject withdrawal request (admin only)
app.post('/admin/withdrawal-action/:request_id', (req, res) => {
  const { request_id } = req.params;
  const { action, admin_notes } = req.body;
  
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ message: "Invalid action" });
  }
  
  db.get("SELECT * FROM withdrawal_requests WHERE id = ?", [request_id], (err, request) => {
    if (err) {
      console.error("Error fetching withdrawal request:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (!request) {
      return res.status(404).json({ message: "Withdrawal request not found" });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ message: "This request has already been processed" });
    }
    
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      
      // Update request status
      db.run("UPDATE withdrawal_requests SET status = ?, admin_notes = ? WHERE id = ?", 
        [action === 'approve' ? 'approved' : 'rejected', admin_notes || '', request_id], 
        function(err) {
          if (err) {
            console.error("Error updating withdrawal request:", err);
            db.run("ROLLBACK");
            return res.status(500).json({ message: "Failed to update withdrawal request" });
          }
          
          // If approved, actually perform the withdrawal
          if (action === 'approve') {
            db.run("UPDATE users SET balance = balance - ? WHERE username = ?", 
              [request.amount, request.username], function(err) {
                if (err) {
                  console.error("Error updating balance:", err);
                  db.run("ROLLBACK");
                  return res.status(500).json({ message: "Failed to update user balance" });
                }
                
                // Record transaction
                db.run("INSERT INTO transactions (username, type, amount) VALUES (?, ?, ?)", 
                  [request.username, "withdraw", request.amount], (err) => {
                    if (err) {
                      console.error("Error recording transaction:", err);
                      db.run("ROLLBACK");
                      return res.status(500).json({ message: "Failed to record transaction" });
                    }
                    
                    db.run("COMMIT");
                    res.json({ message: `Withdrawal request ${action}d successfully` });
                  }
                );
              }
            );
          } else {
            // If rejected, just commit the transaction
            db.run("COMMIT");
            res.json({ message: `Withdrawal request ${action}d successfully` });
          }
        }
      );
    });
  });
});

// Approve or reject deposit request (admin only)
app.post('/admin/deposit-action/:request_id', (req, res) => {
  const { request_id } = req.params;
  const { action, admin_notes } = req.body;
  
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ message: "Invalid action" });
  }
  
  db.get("SELECT * FROM deposit_requests WHERE id = ?", [request_id], (err, request) => {
    if (err) {
      console.error("Error fetching deposit request:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (!request) {
      return res.status(404).json({ message: "Deposit request not found" });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ message: "This request has already been processed" });
    }
    
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      
      // Update request status
      db.run("UPDATE deposit_requests SET status = ?, admin_notes = ? WHERE id = ?", 
        [action === 'approve' ? 'approved' : 'rejected', admin_notes || '', request_id], 
        function(err) {
          if (err) {
            console.error("Error updating deposit request:", err);
            db.run("ROLLBACK");
            return res.status(500).json({ message: "Failed to update deposit request" });
          }
          
          // If approved, actually perform the deposit
          if (action === 'approve') {
            db.run("UPDATE users SET balance = balance + ? WHERE username = ?", 
              [request.amount, request.username], function(err) {
                if (err) {
                  console.error("Error updating balance:", err);
                  db.run("ROLLBACK");
                  return res.status(500).json({ message: "Failed to update user balance" });
                }
                
                // Record transaction
                db.run("INSERT INTO transactions (username, type, amount) VALUES (?, ?, ?)", 
                  [request.username, "deposit", request.amount], (err) => {
                    if (err) {
                      console.error("Error recording transaction:", err);
                      db.run("ROLLBACK");
                      return res.status(500).json({ message: "Failed to record transaction" });
                    }
                    
                    db.run("COMMIT");
                    res.json({ message: `Deposit request ${action}d successfully` });
                  }
                );
              }
            );
          } else {
            // If rejected, just commit the transaction
            db.run("COMMIT");
            res.json({ message: `Deposit request ${action}d successfully` });
          }
        }
      );
    });
  });
});

// Serve static files
app.use(express.static('.'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Closed the database connection.');
    process.exit(0);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});