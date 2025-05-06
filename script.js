// script.js

let currentUser = null;
let currentBalance = 0;
// Add an array to store transaction history on the client side
let transactionHistory = [];

document.addEventListener('DOMContentLoaded', function() {
  // Hide wallet section initially, only show login
  document.querySelector('.wallet-section').style.display = 'none';
  document.getElementById('login').style.display = 'block';
  document.getElementById('signup').style.display = 'none';
  
  // Check if user was previously logged in (using sessionStorage)
  const savedUser = sessionStorage.getItem('currentUser');
  const savedBalance = sessionStorage.getItem('currentBalance');
  const savedHistory = sessionStorage.getItem('transactionHistory');
  
  if (savedUser && savedBalance) {
    currentUser = savedUser;
    currentBalance = parseFloat(savedBalance);
    if (savedHistory) {
      transactionHistory = JSON.parse(savedHistory);
    }
    showWallet();
    displayTransactionHistory();
  }
});

function updateBalanceDisplay() {
  document.getElementById("balance").textContent = currentBalance.toFixed(2);
  // Save current state to sessionStorage
  sessionStorage.setItem('currentUser', currentUser);
  sessionStorage.setItem('currentBalance', currentBalance);
  sessionStorage.setItem('transactionHistory', JSON.stringify(transactionHistory));
}

function addToHistory(type, amount) {
  const timestamp = new Date().toLocaleString();
  const transaction = {
    type: type,
    amount: amount,
    timestamp: timestamp
  };
  
  // Add to our local transaction array
  transactionHistory.unshift(transaction);
  
  // Display the updated history
  displayTransactionHistory();
}

function displayTransactionHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = ''; // Clear current list
  
  if (transactionHistory.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No transactions yet";
    emptyItem.style.fontStyle = "italic";
    emptyItem.style.color = "#888";
    list.appendChild(emptyItem);
    return;
  }
  
  // Display each transaction
  transactionHistory.forEach(transaction => {
    const item = document.createElement("li");
    item.className = transaction.type.toLowerCase(); // Add class for styling
    item.textContent = `${transaction.timestamp} - ${transaction.type}: ₹${parseFloat(transaction.amount).toFixed(2)}`;
    list.appendChild(item);
  });
}

async function fetchTransactionHistory() {
  if (!currentUser) return;
  
  try {
    const res = await fetch(`http://localhost:3000/history/${currentUser}`);
    
    if (res.ok) {
      const data = await res.json();
      if (data.transactions && data.transactions.length > 0) {
        transactionHistory = data.transactions.map(t => ({
          type: t.type.charAt(0).toUpperCase() + t.type.slice(1), // Capitalize first letter
          amount: t.amount,
          timestamp: new Date(t.timestamp).toLocaleString()
        }));
        displayTransactionHistory();
        sessionStorage.setItem('transactionHistory', JSON.stringify(transactionHistory));
      }
    }
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    // If server is not available, we already have local history, so just use that
  }
}

async function fetchPendingWithdrawals() {
  if (!currentUser) return;
  
  try {
    const res = await fetch(`http://localhost:3000/pending-withdrawals/${currentUser}`);
    
    if (res.ok) {
      const data = await res.json();
      const pendingDiv = document.getElementById("pending-withdrawals");
      
      if (!data.requests || data.requests.length === 0) {
        pendingDiv.innerText = "No pending withdrawals";
        return;
      }
      
      pendingDiv.innerHTML = '';
      
      data.requests.forEach(request => {
        const requestElem = document.createElement("div");
        requestElem.className = "pending-request";
        requestElem.innerHTML = `
          <div class="request-details">
            <div>Request: <span class="request-amount">₹${parseFloat(request.amount).toFixed(2)}</span></div>
            <div class="request-date">${new Date(request.request_date).toLocaleString()}</div>
          </div>
          <span class="pending-badge">${request.status.toUpperCase()}</span>
        `;
        pendingDiv.appendChild(requestElem);
      });
    }
  } catch (error) {
    console.error("Error fetching pending withdrawals:", error);
    // If server is unavailable, just leave as is
  }
}

async function fetchPendingDeposits() {
  if (!currentUser) return;
  
  try {
    const res = await fetch(`http://localhost:3000/pending-deposits/${currentUser}`);
    
    if (res.ok) {
      const data = await res.json();
      const pendingDiv = document.getElementById("pending-deposits");
      
      if (!data.requests || data.requests.length === 0) {
        pendingDiv.innerText = "No pending deposits";
        return;
      }
      
      pendingDiv.innerHTML = '';
      
      data.requests.forEach(request => {
        const requestElem = document.createElement("div");
        requestElem.className = "pending-request " + request.status.toLowerCase();
        requestElem.innerHTML = `
          <div class="request-details">
            <div>Deposit: <span class="request-amount">₹${parseFloat(request.amount).toFixed(2)}</span></div>
            <div class="request-date">${new Date(request.request_date).toLocaleString()}</div>
            ${request.reference_id ? `<div class="reference-id">Ref: ${request.reference_id}</div>` : ''}
          </div>
          <span class="pending-badge">${request.status.toUpperCase()}</span>
        `;
        pendingDiv.appendChild(requestElem);
      });
    }
  } catch (error) {
    console.error("Error fetching pending deposits:", error);
    // If server is unavailable, just leave as is
  }
}

function showWallet() {
  document.querySelector('.wallet-section').style.display = 'block';
  document.getElementById('login').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'inline';
  updateBalanceDisplay();
  fetchTransactionHistory(); // Try to get history from server
  fetchPendingWithdrawals(); // Get any pending withdrawal requests
  fetchPendingDeposits(); // Get any pending deposit requests
}

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  
  if (!username || !password) {
    document.getElementById("login-status").textContent = "Please enter both username and password";
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    document.getElementById("login-status").textContent = data.message;

    if (res.ok) {
      currentUser = username;
      currentBalance = data.balance || 0;
      transactionHistory = []; // Reset history on new login
      showWallet();
    }
  } catch (error) {
    // Handle case where backend is not running
    console.error("Server connection error:", error);
    document.getElementById("login-status").textContent = 
      "Cannot connect to server. Using demo mode.";
      
    // Demo mode - simulate login for testing
    currentUser = username;
    currentBalance = 1000; // Demo starting balance
    transactionHistory = []; // Reset history for demo
    showWallet();
  }
}

async function signup() {
  const username = document.getElementById("new-username").value;
  const password = document.getElementById("new-password").value;

  if (!username || !password) {
    document.getElementById("signup-status").textContent = "Please enter both username and password";
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    document.getElementById("signup-status").textContent = data.message;
    
    if (res.ok) {
      // Auto switch to login after successful signup
      setTimeout(() => toggleSignup(false), 1500);
    }
  } catch (error) {
    // Handle case where backend is not running
    console.error("Server connection error:", error);
    document.getElementById("signup-status").textContent = 
      "Cannot connect to server. Account created in demo mode.";
    
    // Auto switch to login after demo signup
    setTimeout(() => toggleSignup(false), 1500);
  }
}

async function deposit() {
  const amount = parseFloat(document.getElementById("amount").value);
  const referenceId = document.getElementById("reference-id") ? 
                       document.getElementById("reference-id").value : "";
  
  if (!currentUser || isNaN(amount) || amount <= 0) {
    alert("Please enter a valid amount");
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        username: currentUser, 
        amount,
        reference_id: referenceId 
      })
    });

    const data = await res.json();
    if (res.ok) {
      alert("Deposit request submitted. Please complete the payment using the QR code and provide the reference ID if available.");
      document.getElementById("amount").value = "";
      if (document.getElementById("reference-id")) {
        document.getElementById("reference-id").value = "";
      }
      // Update the pending deposits display
      fetchPendingDeposits();
    } else {
      alert(data.message || "Error processing deposit request");
    }
  } catch (error) {
    // Handle case where backend is not running
    console.error("Server connection error:", error);
    alert("Cannot connect to server. Please try again later.");
  }
}

async function withdraw() {
  const amount = parseFloat(document.getElementById("amount").value);
  if (!currentUser || isNaN(amount) || amount <= 0) {
    alert("Please enter a valid amount");
    return;
  }

  if (amount > currentBalance) {
    alert("Insufficient funds");
    return;
  }

  try {
    // Changed endpoint from /withdraw to /request-withdrawal
    const res = await fetch("http://localhost:3000/request-withdrawal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, amount })
    });

    const data = await res.json();
    if (res.ok) {
      alert("Withdrawal request submitted. Pending admin approval.");
      document.getElementById("amount").value = "";
      // Update the pending withdrawals display
      fetchPendingWithdrawals();
    } else {
      alert(data.message || "Error processing withdrawal request");
    }
  } catch (error) {
    // Handle case where backend is not running
    console.error("Server connection error:", error);
    alert("Cannot connect to server. Please try again later.");
  }
}

function toggleSignup(showSignup) {
  document.getElementById("signup").style.display = showSignup ? "block" : "none";
  document.getElementById("login").style.display = showSignup ? "none" : "block";
  // Clear status messages when toggling
  document.getElementById("login-status").textContent = "";
  document.getElementById("signup-status").textContent = "";
}

function logout() {
  currentUser = null;
  currentBalance = 0;
  transactionHistory = [];
  
  // Clear session storage
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentBalance');
  sessionStorage.removeItem('transactionHistory');
  
  updateBalanceDisplay();
  document.getElementById("history-list").innerHTML = "";
  document.querySelector('.wallet-section').style.display = 'none';
  document.getElementById('login').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("login-status").textContent = "Logged out successfully";
}