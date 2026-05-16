/**
 * FinTrack — Personal Finance Manager
 * Convex-powered frontend application
 */

/* ConvexClient is provided by convex-browser.js loaded via <script> tag */
if (typeof convex === "undefined" && typeof window.convex === "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#0f172a;color:#f8fafc">' +
      '<div style="text-align:center;max-width:420px;padding:32px">' +
      '<h2 style="color:#ef4444;margin-bottom:12px">Failed to load</h2>' +
      '<p style="color:#94a3b8">The Convex client library could not be loaded. Please refresh or check your network connection.</p>' +
      '</div></div>';
  });
  throw new Error("Convex browser bundle not loaded");
}
const { ConvexClient } = (typeof convex !== "undefined" ? convex : window.convex);

// ═══════════════════════════ CONVEX SETUP ═══════════════════════════
const CONVEX_URL = "https://capable-nightingale-509.eu-west-1.convex.cloud";
const client = new ConvexClient(CONVEX_URL);

// ═══════════════════════════ ERROR HELPER ═════════════════════════════
function errMsg(err) {
  if (!err) return "Something went wrong. Please try again.";
  // Convex ConvexError may wrap the message differently
  if (typeof err === "string") return err;
  if (err.message && typeof err.message === "string") {
    // Strip Convex internal prefixes like "[CONVEX M(...)] Uncaught Error: "
    return err.message.replace(/^\[.*?\]\s*/, "").replace(/^Uncaught Error:\s*/i, "");
  }
  if (err.data && typeof err.data === "string") return err.data;
  return "Something went wrong. Please try again.";
}

// ═══════════════════════════ STATE ═══════════════════════════════════
let state = {
  token: null,
  userId: null,
  username: null,
  accounts: [],
  transactions: [],
  debtors: [],
  currentSection: "dashboard",
  currentDebtor: null,
  currentTxType: "income",
  currentSavingsTxType: "income",
  currentDebtTxType: "given",
  debtorFilter: "",
  transactionFilter: { account: "", type: "", month: "" },
  loading: false,
};

// ═══════════════════════════ INIT ════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // Set today's date for date inputs
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("tx-date").value = today;
  document.getElementById("debt-tx-date").value = today;
  document.getElementById("savings-tx-date").value = today;

  // Dashboard date
  document.getElementById("dashboard-date").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Month filter default
  const monthFilter = document.getElementById("tx-filter-month");
  if (monthFilter) {
    monthFilter.value = new Date().toISOString().slice(0, 7);
  }

  // Password strength
  const pwInput = document.getElementById("reg-password");
  if (pwInput) {
    pwInput.addEventListener("input", updatePasswordStrength);
  }

  // Load session
  const savedToken = sessionStorage.getItem("fintrack_token");
  const savedUsername = sessionStorage.getItem("fintrack_username");
  if (savedToken) {
    state.token = savedToken;
    state.username = savedUsername;
    verifySessionAndLoad();
  } else {
    showAuthScreen();
  }
});

// ═══════════════════════════ AUTH ════════════════════════════════════
async function verifySessionAndLoad() {
  try {
    const user = await client.query("auth:validateSession", { token: state.token });
    if (user) {
      state.username = user.username;
      state.userId = user.userId;
      sessionStorage.setItem("fintrack_token", state.token);
      sessionStorage.setItem("fintrack_username", user.username);
      showApp();
    } else {
      clearSession();
      showAuthScreen();
    }
  } catch {
    clearSession();
    showAuthScreen();
  }
}

function clearSession() {
  state.token = null;
  state.username = null;
  state.userId = null;
  sessionStorage.removeItem("fintrack_token");
  sessionStorage.removeItem("fintrack_username");
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("sidebar-username").textContent = state.username || "User";
  document.getElementById("sidebar-avatar").textContent = (state.username || "U")[0].toUpperCase();
  navigate("dashboard");
}

// Login
document.getElementById("login-form-el").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = sanitize(document.getElementById("login-email").value);
  const password = document.getElementById("login-password").value;

  clearFieldErrors(["login-email-err", "login-pw-err"]);
  let valid = true;

  if (!email) { setFieldError("login-email-err", "Email is required"); valid = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError("login-email-err", "Invalid email"); valid = false; }
  if (!password) { setFieldError("login-pw-err", "Password is required"); valid = false; }
  if (!valid) return;

  setButtonLoading("login-btn", true);
  hideError("login-error");

  try {
    const result = await client.mutation("auth:login", { email, password });
    state.token = result.token;
    state.username = result.username;
    sessionStorage.setItem("fintrack_token", result.token);
    sessionStorage.setItem("fintrack_username", result.username);
    showApp();
    showToast("Welcome back, " + result.username + "!", "success");
  } catch (err) {
    console.error("Login error:", err);
    showError("login-error", errMsg(err));
  } finally {
    setButtonLoading("login-btn", false);
  }
});

// Register
document.getElementById("register-form-el").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = sanitize(document.getElementById("reg-username").value);
  const email = sanitize(document.getElementById("reg-email").value).toLowerCase();
  const password = document.getElementById("reg-password").value;
  const confirmPw = document.getElementById("reg-confirm-password").value;

  clearFieldErrors(["reg-username-err", "reg-email-err", "reg-pw-err", "reg-confirm-err"]);
  let valid = true;

  if (!username || username.length < 3) { setFieldError("reg-username-err", "Min 3 characters"); valid = false; }
  else if (!/^[a-zA-Z0-9_]+$/.test(username)) { setFieldError("reg-username-err", "Only letters, numbers, underscores"); valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError("reg-email-err", "Valid email required"); valid = false; }
  if (!password || password.length < 8) { setFieldError("reg-pw-err", "Min 8 characters"); valid = false; }
  else if (!/[A-Z]/.test(password)) { setFieldError("reg-pw-err", "Must contain uppercase letter"); valid = false; }
  else if (!/[0-9]/.test(password)) { setFieldError("reg-pw-err", "Must contain a number"); valid = false; }
  if (password !== confirmPw) { setFieldError("reg-confirm-err", "Passwords do not match"); valid = false; }
  if (!valid) return;

  setButtonLoading("register-btn", true);
  hideError("register-error");

  try {
    const result = await client.mutation("auth:register", { username, email, password });
    state.token = result.token;
    state.username = result.username;
    sessionStorage.setItem("fintrack_token", result.token);
    sessionStorage.setItem("fintrack_username", result.username);
    showApp();
    showToast("Account created! Welcome, " + result.username + "!", "success");
  } catch (err) {
    console.error("Register error:", err);
    showError("register-error", errMsg(err));
  } finally {
    setButtonLoading("register-btn", false);
  }
});

window.logout = async function () {
  if (state.token) {
    try { await client.mutation("auth:logout", { token: state.token }); } catch {}
  }
  clearSession();
  showAuthScreen();
  showToast("Signed out successfully", "success");
};

window.showRegister = function () {
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("register-form").classList.remove("hidden");
  clearFieldErrors(["reg-username-err", "reg-email-err", "reg-pw-err", "reg-confirm-err"]);
  hideError("register-error");
};

window.showLogin = function () {
  document.getElementById("register-form").classList.add("hidden");
  document.getElementById("login-form").classList.remove("hidden");
  clearFieldErrors(["login-email-err", "login-pw-err"]);
  hideError("login-error");
};

// ═══════════════════════════ NAVIGATION ══════════════════════════════
window.navigate = function (section) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.getElementById("section-" + section)?.classList.add("active");
  document.querySelector(`[data-section="${section}"]`)?.classList.add("active");

  const titles = { dashboard: "Dashboard", accounts: "Accounts", transactions: "Transactions", transfers: "Transfers", savings: "Savings", debtors: "Debtor Ledger", companies: "Companies" };
  document.getElementById("header-title").textContent = titles[section] || section;

  state.currentSection = section;
  loadSection(section);

  // Close sidebar on mobile
  if (window.innerWidth <= 900) closeSidebar();
};

window.toggleSidebar = function () {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("show");
};

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
}

window.refreshData = function () {
  loadSection(state.currentSection);
  showToast("Data refreshed", "success");
};

async function loadSection(section) {
  try {
    if (section === "dashboard") await loadDashboard();
    else if (section === "accounts") await loadAccounts();
    else if (section === "transactions") await loadTransactions();
    else if (section === "transfers") await loadTransfers();
    else if (section === "savings") await loadSavings();
    else if (section === "debtors") await loadDebtors();
    else if (section === "companies") await loadCompanies();
  } catch (err) {
    console.error("Navigation error:", err);
    if (errMsg(err).includes("Unauthorized")) {
      clearSession();
      showAuthScreen();
      showToast("Session expired. Please sign in again.", "warning");
    } else {
      showToast(errMsg(err), "error");
    }
  }
}

// ═══════════════════════════ DASHBOARD ═══════════════════════════════
async function loadDashboard() {
  const [accountSummary, txSummary, debtorsSummary, accounts, recentTx, debtors] = await Promise.all([
    client.query("accounts:getAccountSummary", { token: state.token }),
    client.query("transactions:getTransactionSummary", {
      token: state.token,
      startDate: getMonthStart(),
      endDate: getMonthEnd(),
    }),
    client.query("debtors:getDebtorsSummary", { token: state.token }),
    client.query("accounts:getAccounts", { token: state.token }),
    client.query("transactions:getTransactions", { token: state.token, limit: 5 }),
    client.query("debtors:getDebtors", { token: state.token }),
  ]);

  state.accounts = accounts;

  // Summary cards
  document.getElementById("total-balance").textContent = fmt(accountSummary.totalBalance);
  document.getElementById("total-savings").textContent = fmt(accountSummary.totalSavings);
  document.getElementById("monthly-income").textContent = fmt(txSummary.totalIncome);
  document.getElementById("monthly-expenses").textContent = fmt(txSummary.totalExpenses);
  document.getElementById("total-receivables").textContent = fmt(debtorsSummary.totalReceivables);

  // Accounts mini list
  const accEl = document.getElementById("dash-accounts");
  if (accounts.length === 0) {
    accEl.innerHTML = emptyState("Go to Accounts → click \"+\u00a0New Account\" to get started");
  } else {
    accEl.innerHTML = accounts.map((a) => `
      <div class="account-mini-item" onclick="navigate('accounts')">
        <div class="acc-mini-dot" style="background:${a.color}"></div>
        <div class="acc-mini-info">
          <div class="acc-mini-name">${escHtml(a.name)}</div>
          <div class="acc-mini-type">${capitalize(a.type)}</div>
        </div>
        <div class="acc-mini-balance" style="color:${a.balance < 0 ? 'var(--danger)' : 'var(--text-primary)'}">${fmt(a.balance)}</div>
      </div>
    `).join("");
  }

  // Recent transactions
  const txEl = document.getElementById("dash-transactions");
  if (recentTx.length === 0) {
    txEl.innerHTML = emptyState("No transactions yet");
  } else {
    txEl.innerHTML = recentTx.map((t) => `
      <div class="tx-mini-item">
        <div class="tx-mini-dot" style="background:${t.type==='income'?'var(--success)':t.type==='expense'?'var(--danger)':'var(--primary)'}"></div>
        <div class="tx-mini-info">
          <div class="tx-mini-cat">${escHtml(t.category)}</div>
          <div class="tx-mini-date">${formatDate(t.date)}</div>
        </div>
        <div class="tx-mini-amount" style="color:${t.type==='income'?'var(--success)':t.type==='expense'?'var(--danger)':'var(--primary)'}">
          ${t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}${fmt(t.amount)}
        </div>
      </div>
    `).join("");
  }

  // Debtors mini
  const debEl = document.getElementById("dash-debtors");
  const activeDebtors = debtors.filter((d) => d.status !== "cleared").slice(0, 5);
  if (activeDebtors.length === 0) {
    debEl.innerHTML = emptyState("No active debtors");
  } else {
    debEl.innerHTML = activeDebtors.map((d) => `
      <div class="debtor-mini-item" onclick="navigate('debtors')">
        <div class="user-avatar" style="width:36px;height:36px;font-size:.9rem;">${escHtml(d.name[0].toUpperCase())}</div>
        <div class="acc-mini-info">
          <div class="acc-mini-name">${escHtml(d.name)}</div>
          <div class="acc-mini-type">${statusBadge(d.status)}</div>
        </div>
        <div class="tx-mini-amount" style="color:var(--danger)">${fmt(d.totalOwed)}</div>
      </div>
    `).join("");
  }
}

// ═══════════════════════════ ACCOUNTS ════════════════════════════════
async function loadAccounts() {
  const accounts = await client.query("accounts:getAccounts", { token: state.token });
  state.accounts = accounts;
  populateAccountSelects();

  const grid = document.getElementById("accounts-grid");
  if (accounts.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      ${svgEmpty()}
      <p>No accounts yet.<br><strong>Click “+ New Account” above</strong> to create your first account (e.g. Main Account or Savings).</p>
    </div>`;
    return;
  }

  grid.innerHTML = accounts.map((a) => `
    <div class="account-card">
      <div class="account-card-top" style="--accent:${a.color};cursor:pointer" onclick="openAccountTransactions('${a._id}')" title="View transactions">
        <div class="acc-type-badge">${capitalize(a.type)}</div>
        <div class="acc-name">${escHtml(a.name)}</div>
        <div class="acc-balance">${fmt(a.balance)}</div>
        <div style="font-size:0.7rem;opacity:0.75;margin-top:4px">Tap to view transactions →</div>
      </div>
      <div class="account-card-bottom">
        <div class="acc-description">${escHtml(a.description || '')}</div>
        <div class="acc-actions">
          <button class="acc-action-btn tx-btn" onclick="openAddTxForAccount('${a._id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Tx
          </button>
          <button class="acc-action-btn" onclick="confirmDeleteAccount('${a._id}', '${escAttr(a.name)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

window.openAccountTransactions = function(accountId) {
  navigate("transactions");
  setTimeout(() => {
    const sel = document.getElementById("tx-filter-account");
    if (sel) {
      sel.value = accountId;
      applyTransactionFilters();
    }
  }, 300);
};

window.createAccount = async function () {
  const name = sanitize(document.getElementById("acc-name").value);
  const type = document.getElementById("acc-type").value;
  const color = document.getElementById("acc-color").value;
  const description = sanitize(document.getElementById("acc-description").value);
  const initialBalance = parseFloat(document.getElementById("acc-initial-balance").value) || 0;

  clearFieldErrors(["acc-name-err"]);
  if (!name) { setFieldError("acc-name-err", "Account name is required"); return; }
  if (name.length > 50) { setFieldError("acc-name-err", "Max 50 characters"); return; }

  try {
    hideError("create-account-error");
    await client.mutation("accounts:createAccount", { token: state.token, name, type, currency: "GBP", color, description, initialBalance });
    hideModal("create-account-modal");
    clearAccountForm();
    await loadAccounts();
    showToast("Account created successfully", "success");
    if (state.currentSection === "dashboard") loadDashboard();
  } catch (err) {
    console.error("Create account error:", err);
    showError("create-account-error", errMsg(err));
  }
};

window.openAddTxForAccount = function (accountId) {
  showModal("add-transaction-modal");
  setTimeout(() => { document.getElementById("tx-account").value = accountId; }, 50);
};

window.confirmDeleteAccount = function (accountId, name) {
  showConfirm(`Delete account "${name}"?`, "This will hide the account. Transactions will be preserved.", async () => {
    try {
      await client.mutation("accounts:deleteAccount", { token: state.token, accountId });
      await Promise.all([loadAccounts(), loadDashboard()]);
      showToast("Account deleted", "success");
    } catch (err) {
      console.error("Delete account error:", err);
      showToast(errMsg(err), "error");
    }
  });
};

function clearAccountForm() {
  document.getElementById("acc-name").value = "";
  document.getElementById("acc-type").value = "checking";
  document.getElementById("acc-color").value = "#4F46E5";
  document.getElementById("acc-initial-balance").value = "";
  document.getElementById("acc-description").value = "";
}

// ═══════════════════════════ TRANSACTIONS ════════════════════════════
async function loadTransactions() {
  const accounts = await client.query("accounts:getAccounts", { token: state.token });
  state.accounts = accounts;
  populateAccountSelects();

  await applyTransactionFilters();
}

async function applyTransactionFilters() {
  const accountId = document.getElementById("tx-filter-account").value || undefined;
  const type = document.getElementById("tx-filter-type").value || undefined;
  const month = document.getElementById("tx-filter-month").value;

  let startDate, endDate;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    startDate = new Date(y, m - 1, 1).getTime();
    endDate = new Date(y, m, 0, 23, 59, 59).getTime();
  }

  const transactions = await client.query("transactions:getTransactions", {
    token: state.token,
    accountId,
    type,
    startDate,
    endDate,
  });

  renderTransactions(transactions);

  // Summary bar
  const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  document.getElementById("tx-summary-bar").innerHTML = `
    <span class="tx-sum-item green">Income: <strong>${fmt(income)}</strong></span>
    <span class="tx-sum-item red">Expenses: <strong>${fmt(expense)}</strong></span>
    <span class="tx-sum-item">Net: <strong style="color:${income-expense>=0?'var(--success)':'var(--danger)'}">${fmt(income - expense)}</strong></span>
  `;
}

function renderTransactions(transactions) {
  const list = document.getElementById("transactions-list");
  if (!transactions.length) {
    list.innerHTML = `<div class="empty-state">${svgEmpty()}<p>No transactions found for selected filters.</p></div>`;
    return;
  }

  // Group by date
  const groups = {};
  transactions.forEach((t) => {
    const dateKey = new Date(t.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(t);
  });

  list.innerHTML = Object.entries(groups).map(([date, txs]) => `
    <div class="tx-date-group">
      <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;padding:4px 0 8px;">${date}</div>
      ${txs.map((t) => renderTxItem(t)).join("")}
    </div>
  `).join("");
}

function renderTxItem(t) {
  const icon = t.type === "income"
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`
    : t.type === "expense"
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>`;

  const sign = t.type === "income" ? "+" : t.type === "expense" ? "-" : "";
  return `
    <div class="transaction-item">
      <div class="tx-icon ${t.type}">${icon}</div>
      <div class="tx-info">
        <div class="tx-category">${escHtml(t.category)}</div>
        <div class="tx-desc">${escHtml(t.description || t.notes || "")}</div>
        <div class="tx-meta" style="color:${t.accountColor}">${escHtml(t.accountName)}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${t.type}">${sign}${fmt(t.amount)}</div>
        <div class="tx-date">${formatTime(t.date)}</div>
      </div>
      <button class="tx-delete-btn" onclick="confirmDeleteTx('${t._id}', '${escAttr(t.category)}')" title="Delete">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>
  `;
}

window.filterTransactions = function () {
  applyTransactionFilters();
};

window.setTxType = function (type, btn) {
  state.currentTxType = type;
  document.querySelectorAll("#add-transaction-modal .tx-tab").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tx-to-account-group").style.display = "none";
  document.getElementById("tx-category-group").style.display = "block";
  document.getElementById("tx-notes").placeholder = "Additional notes...";
  populateCategorySelect(type);
};

window.onCategoryChange = function (sel) {
  const custom = document.getElementById("tx-category-custom");
  custom.style.display = sel.value === "__custom__" ? "block" : "none";
};

function populateCategorySelect(type) {
  const cats = type === "income"
    ? ["Salary", "Freelance", "Business", "Investment", "Gift", "Bonus", "Rental", "Other Income"]
    : ["Food & Dining", "Groceries", "Shopping", "Transport", "Utilities", "Healthcare", "Entertainment", "Education", "Rent", "Insurance", "Travel", "Subscriptions", "Other"];
  const sel = document.getElementById("tx-category-select");
  sel.innerHTML = `<option value="">Select category...</option>` + cats.map((c) => `<option value="${c}">${c}</option>`).join("") + `<option value="__custom__">+ Custom...</option>`;
  document.getElementById("tx-category-custom").style.display = "none";
  document.getElementById("tx-category-custom").value = "";
}

window.addTransaction = async function () {
  const accountId = document.getElementById("tx-account").value;
  const toAccountId = document.getElementById("tx-to-account").value || undefined;
  const amountStr = document.getElementById("tx-amount").value;
  const date = document.getElementById("tx-date").value;
  const catSelect = document.getElementById("tx-category-select").value;
  const catCustom = sanitize(document.getElementById("tx-category-custom").value);
  const category = catSelect === "__custom__" ? catCustom : catSelect;
  const description = sanitize(document.getElementById("tx-description").value);
  const notes = sanitize(document.getElementById("tx-notes").value);

  clearFieldErrors(["tx-amount-err", "tx-category-err"]);
  let valid = true;
  if (!accountId) { showError("add-tx-error", "Please select an account"); return; }
  const amount = parseFloat(amountStr);
  if (!amountStr || isNaN(amount) || amount <= 0) { setFieldError("tx-amount-err", "Valid amount required"); valid = false; }
  if (!date) { showError("add-tx-error", "Date is required"); return; }
  if (state.currentTxType !== "transfer" && !category) { setFieldError("tx-category-err", "Category is required"); valid = false; }
  if (!valid) return;

  const finalCategory = state.currentTxType === "transfer" ? "Transfer" : category;

  try {
    hideError("add-tx-error");
    await client.mutation("transactions:addTransaction", {
      token: state.token,
      accountId,
      type: state.currentTxType,
      amount,
      category: finalCategory,
      description: description || undefined,
      notes: notes || undefined,
      date: new Date(date).getTime(),
      toAccountId: undefined,
    });
    hideModal("add-transaction-modal");
    clearTxForm();
    await loadSection(state.currentSection);
    showToast("Transaction added", "success");
  } catch (err) {
    console.error("Add transaction error:", err);
    showError("add-tx-error", errMsg(err));
  }
};

window.confirmDeleteTx = function (txId, category) {
  showConfirm(`Delete "${category}" transaction?`, "This will reverse the balance change.", async () => {
    try {
      await client.mutation("transactions:deleteTransaction", { token: state.token, transactionId: txId });
      await loadSection(state.currentSection);
      showToast("Transaction deleted", "success");
    } catch (err) {
      console.error("Delete transaction error:", err);
      showToast(errMsg(err), "error");
    }
  });
};

function clearTxForm() {
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("tx-category-select").value = "";
  document.getElementById("tx-category-custom").value = "";
  document.getElementById("tx-description").value = "";
  document.getElementById("tx-notes").value = "";
  hideError("add-tx-error");
}

// ═══════════════════════════ TRANSFERS ═══════════════════════════════
async function loadTransfers() {
  const accounts = await client.query("accounts:getAccounts", { token: state.token });
  state.accounts = accounts;

  // Populate from-account filter
  const filterSel = document.getElementById("tr-filter-account");
  if (filterSel) {
    filterSel.innerHTML = `<option value="">All Accounts</option>` +
      accounts.map((a) => `<option value="${a._id}">${escHtml(a.name)}</option>`).join("");
  }

  // Populate modal from-account select
  const modalSel = document.getElementById("tr-from-account");
  if (modalSel) {
    modalSel.innerHTML = `<option value="">— None / Cash —</option>` +
      accounts.map((a) => `<option value="${a._id}">${escHtml(a.name)}</option>`).join("");
  }

  await applyTransferFilters();
}

async function applyTransferFilters() {
  const fromAccountId = document.getElementById("tr-filter-account")?.value || undefined;
  const month = document.getElementById("tr-filter-month")?.value || undefined;

  const transfers = await client.query("transfers:getTransfers", {
    token: state.token,
    fromAccountId: fromAccountId || undefined,
    month: month || undefined,
  });

  const total = transfers.reduce((s, t) => s + t.amount, 0);
  document.getElementById("tr-summary-bar").innerHTML =
    `<span class="tx-sum-item">Total Sent: <strong style="color:var(--primary)">${fmt(total)}</strong></span>
     <span class="tx-sum-item">${transfers.length} record${transfers.length !== 1 ? "s" : ""}</span>`;

  const list = document.getElementById("transfers-list");
  if (!transfers.length) {
    list.innerHTML = `<div class="empty-state">${svgEmpty()}<p>No transfers yet.<br><strong>Click "+ Add Transfer"</strong> to record one.</p></div>`;
    return;
  }

  list.innerHTML = transfers.map((t) => {
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `<div class="transaction-item transfer-card">
      <div class="tx-icon transfer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
      </div>
      <div class="tx-info">
        <div class="tx-category">→ ${escHtml(t.toNote)}</div>
        ${t.fromAccountName ? `<div class="tx-desc">From: <strong>${escHtml(t.fromAccountName)}</strong></div>` : ""}
        ${t.notes ? `<div class="tx-desc" style="font-style:italic;color:var(--text-muted)">${escHtml(t.notes)}</div>` : ""}
        <div class="tx-meta">${dateStr}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount transfer">${fmt(t.amount)}</div>
        <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px">
          <button class="tx-delete-btn" onclick="openEditTransfer('${t._id}','${escAttr(t.toNote)}',${t.amount},'${new Date(t.date).toISOString().slice(0,10)}','${escAttr(t.fromAccountId||"")}','${escAttr(t.notes||"")}')" title="Edit" style="color:var(--primary)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="tx-delete-btn" onclick="deleteTransfer('${t._id}')" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join("");
}

window.openAddTransferModal = function () {
  state.editingTransferId = null;
  document.getElementById("add-transfer-title").textContent = "Add Transfer";
  document.getElementById("add-transfer-submit-text").textContent = "Save Transfer";
  document.getElementById("tr-from-account").value = "";
  document.getElementById("tr-to-note").value = "";
  document.getElementById("tr-amount").value = "";
  document.getElementById("tr-notes").value = "";
  document.getElementById("tr-date").value = new Date().toISOString().slice(0, 10);
  hideError("add-transfer-error");
  showModal("add-transfer-modal");
};

window.openEditTransfer = function (id, toNote, amount, date, fromAccountId, notes) {
  state.editingTransferId = id;
  document.getElementById("add-transfer-title").textContent = "Edit Transfer";
  document.getElementById("add-transfer-submit-text").textContent = "Update Transfer";
  document.getElementById("tr-to-note").value = toNote;
  document.getElementById("tr-amount").value = amount;
  document.getElementById("tr-date").value = date;
  document.getElementById("tr-notes").value = notes;
  hideError("add-transfer-error");
  showModal("add-transfer-modal");
  // Set account after modal shown (select may need to be populated)
  setTimeout(() => {
    if (fromAccountId) document.getElementById("tr-from-account").value = fromAccountId;
  }, 50);
};

window.filterTransfers = function () {
  applyTransferFilters();
};

window.submitTransfer = async function () {
  const fromAccountId = document.getElementById("tr-from-account").value || undefined;
  const toNote = sanitize(document.getElementById("tr-to-note").value);
  const amountStr = document.getElementById("tr-amount").value;
  const date = document.getElementById("tr-date").value;
  const notes = sanitize(document.getElementById("tr-notes").value);

  clearFieldErrors(["tr-to-note-err", "tr-amount-err"]);
  let valid = true;
  if (!toNote) { setFieldError("tr-to-note-err", "Please describe where money went"); valid = false; }
  const amount = parseFloat(amountStr);
  if (!amountStr || isNaN(amount) || amount <= 0) { setFieldError("tr-amount-err", "Valid amount required"); valid = false; }
  if (!date) { showError("add-transfer-error", "Date is required"); return; }
  if (!valid) return;

  try {
    hideError("add-transfer-error");
    if (state.editingTransferId) {
      await client.mutation("transfers:updateTransfer", {
        token: state.token,
        transferId: state.editingTransferId,
        fromAccountId: fromAccountId || undefined,
        toNote,
        amount,
        date: new Date(date).getTime(),
        notes: notes || undefined,
      });
      showToast("Transfer updated", "success");
    } else {
      await client.mutation("transfers:addTransfer", {
        token: state.token,
        fromAccountId: fromAccountId || undefined,
        toNote,
        amount,
        date: new Date(date).getTime(),
        notes: notes || undefined,
      });
      showToast("Transfer recorded", "success");
    }
    hideModal("add-transfer-modal");
    state.editingTransferId = null;
    await loadTransfers();
  } catch (err) {
    console.error("Transfer error:", err);
    showError("add-transfer-error", errMsg(err));
  }
};

window.deleteTransfer = function (transferId) {
  showConfirm("Delete this transfer record?", "This only removes the reminder, it does not affect any account balance.", async () => {
    try {
      await client.mutation("transfers:deleteTransfer", { token: state.token, transferId });
      await loadTransfers();
      showToast("Transfer deleted", "success");
    } catch (err) {
      console.error("Delete transfer error:", err);
      showToast(errMsg(err), "error");
    }
  });
};

// ═══════════════════════════ SAVINGS ═════════════════════════════════
async function loadSavings() {
  const [accounts, allTx] = await Promise.all([
    client.query("accounts:getAccounts", { token: state.token }),
    client.query("transactions:getTransactions", { token: state.token }),
  ]);

  // Only use active accounts (isActive may be absent on older records, treat as true)
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const savingsAccounts = activeAccounts.filter((a) => a.type === "savings");
  const totalSavings = savingsAccounts.reduce((s, a) => s + a.balance, 0);
  const savingsTx = allTx.filter((t) => {
    const acc = activeAccounts.find((a) => a._id === t.accountId);
    return acc && acc.type === "savings";
  });

  const thisMonthTx = savingsTx.filter((t) => t.date >= getMonthStart() && t.date <= getMonthEnd());
  const monthDeposits = thisMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

  // Overview stats
  document.getElementById("savings-overview").innerHTML = `
    <div class="savings-stat-card">
      <div class="savings-stat-label">Total Savings</div>
      <div class="savings-stat-value">${fmt(totalSavings)}</div>
    </div>
    <div class="savings-stat-card secondary">
      <div class="savings-stat-label">This Month Deposits</div>
      <div class="savings-stat-value">${fmt(monthDeposits)}</div>
    </div>
    <div class="savings-stat-card" style="background:linear-gradient(135deg,#F59E0B,#D97706)">
      <div class="savings-stat-label">Savings Accounts</div>
      <div class="savings-stat-value">${savingsAccounts.length}</div>
    </div>
  `;

  // Savings accounts cards
  const accGrid = document.getElementById("savings-accounts");
  if (savingsAccounts.length === 0) {
    accGrid.innerHTML = `<div class="empty-state"><p>No savings accounts. Create a savings-type account to start tracking.</p></div>`;
  } else {
    accGrid.innerHTML = savingsAccounts.map((a) => `
      <div class="account-card">
        <div class="account-card-top" style="--accent:${a.color}">
          <div class="acc-type-badge">Savings</div>
          <div class="acc-name">${escHtml(a.name)}</div>
          <div class="acc-balance">${fmt(a.balance)}</div>
        </div>
        <div class="account-card-bottom">
          <div class="acc-description">${escHtml(a.description || "")}</div>
          <div class="acc-actions">
            <button class="acc-action-btn tx-btn" onclick="openSavingsTxForAccount('${a._id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Transact
            </button>
          </div>
        </div>
      </div>
    `).join("");
  }

  // Savings transactions
  const txList = document.getElementById("savings-transactions");
  if (savingsTx.length === 0) {
    txList.innerHTML = `<div class="empty-state">${svgEmpty()}<p>No savings transactions yet.</p></div>`;
  } else {
    txList.innerHTML = savingsTx.map((t) => renderTxItem(t)).join("");
  }

  // Populate savings account select
  const savingsSel = document.getElementById("savings-tx-account");
  savingsSel.innerHTML = savingsAccounts.map((a) => `<option value="${a._id}">${escHtml(a.name)}</option>`).join("");
}

window.showSavingsTransaction = function () {
  showModal("savings-tx-modal");
};

window.openSavingsTxForAccount = function (accountId) {
  showModal("savings-tx-modal");
  setTimeout(() => { document.getElementById("savings-tx-account").value = accountId; }, 50);
};

window.setSavingsTxType = function (type, btn) {
  state.currentSavingsTxType = type;
  document.querySelectorAll("#savings-tx-modal .tx-tab").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
};

window.submitSavingsTransaction = async function () {
  const accountId = document.getElementById("savings-tx-account").value;
  const amountStr = document.getElementById("savings-tx-amount").value;
  const date = document.getElementById("savings-tx-date").value;
  const category = sanitize(document.getElementById("savings-tx-category").value) || "Savings";
  const notes = sanitize(document.getElementById("savings-tx-notes").value);

  if (!accountId) { showError("savings-tx-error", "Select a savings account"); return; }
  const amount = parseFloat(amountStr);
  if (!amount || amount <= 0) { showError("savings-tx-error", "Enter a valid amount"); return; }
  if (!date) { showError("savings-tx-error", "Date is required"); return; }

  try {
    hideError("savings-tx-error");
    await client.mutation("transactions:addTransaction", {
      token: state.token,
      accountId,
      type: state.currentSavingsTxType,
      amount,
      category,
      notes: notes || undefined,
      date: new Date(date).getTime(),
    });
    hideModal("savings-tx-modal");
    document.getElementById("savings-tx-amount").value = "";
    await loadSavings();
    showToast(`Savings ${state.currentSavingsTxType === "income" ? "deposit" : "withdrawal"} recorded`, "success");
  } catch (err) {
    console.error("Savings transaction error:", err);
    showError("savings-tx-error", errMsg(err));
  }
};

// ═══════════════════════════ COMPANIES ══════════════════════════════
let editingCompanyId = null;

async function loadCompanies() {
  const [companies, debtors] = await Promise.all([
    client.query("companies:getCompanies", { token: state.token }),
    client.query("debtors:getDebtors", { token: state.token }),
  ]);
  state.companies = companies;
  state.debtors = debtors;
  renderCompanies(companies);
  populateCompanySelect();
}

function populateCompanySelect() {
  const sel = document.getElementById("debtor-company-id");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— No company —</option>` +
    (state.companies || []).map((c) => `<option value="${c._id}">${escHtml(c.name)}</option>`).join("");
  if (current) sel.value = current;
}

function renderCompanies(companies) {
  const grid = document.getElementById("companies-grid");
  if (!companies.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${svgEmpty()}<p>No companies yet.<br><strong>Click "+ Add Company"</strong> to create one.</p></div>`;
    return;
  }
  grid.innerHTML = companies.map((c) => {
    const debtors = (state.debtors || []).filter((d) => d.companyId === c._id);
    return `<div class="debtor-card" style="cursor:pointer" onclick="openCompanyDetail('${c._id}')">
      <div class="debtor-card-header">
        <div class="debtor-avatar" style="background:linear-gradient(135deg,#6366F1,#4F46E5);font-size:1.1rem">🏢</div>
        <div style="flex:1;min-width:0">
          <div class="debtor-name">${escHtml(c.name)}</div>
          ${c.industry ? `<div style="font-size:.75rem;color:var(--primary);font-weight:500">${escHtml(c.industry)}</div>` : ""}
        </div>
      </div>
      <div class="debtor-card-body" style="font-size:.82rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
        ${c.phone ? `<div>📞 ${escHtml(c.phone)}</div>` : ""}
        ${c.email ? `<div>✉️ ${escHtml(c.email)}</div>` : ""}
        ${c.address ? `<div>📍 ${escHtml(c.address)}</div>` : ""}
        ${c.notes ? `<div style="color:var(--text-muted);font-style:italic;margin-top:4px">${escHtml(c.notes)}</div>` : ""}
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-weight:500;color:var(--text-primary)">
          ${debtors.length} linked debtor${debtors.length !== 1 ? "s" : ""}
          ${debtors.length ? `: ${debtors.map(d => escHtml(d.name)).join(", ")}` : ""}
        </div>
      </div>
      <div class="debtor-card-footer" onclick="event.stopPropagation()">
        <div style="font-size:.78rem;color:var(--text-muted)">Created ${formatDate(c.createdAt)}</div>
        <div class="debtor-actions">
          <button class="acc-action-btn" onclick="openEditCompany('${c._id}','${escAttr(c.name)}','${escAttr(c.industry||'')}','${escAttr(c.phone||'')}','${escAttr(c.email||'')}','${escAttr(c.address||'')}','${escAttr(c.notes||'')}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="acc-action-btn" style="color:var(--danger);border-color:#FECACA" onclick="deleteCompany('${c._id}','${escAttr(c.name)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>`;
  }).join("");
}

window.openCompanyDetail = function (companyId) {
  const c = (state.companies || []).find((x) => x._id === companyId);
  if (!c) return;

  document.getElementById("company-detail-name").textContent = c.name;

  // Meta info
  const meta = [c.industry, c.phone, c.email, c.address].filter(Boolean).join("  ·  ");
  document.getElementById("company-detail-meta").textContent = meta || "";

  // Info chips
  const chips = [];
  if (c.industry) chips.push(`<span style="background:var(--primary-light);color:var(--primary);padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:600">${escHtml(c.industry)}</span>`);
  if (c.phone)    chips.push(`<span style="font-size:.82rem">📞 ${escHtml(c.phone)}</span>`);
  if (c.email)    chips.push(`<span style="font-size:.82rem">✉️ ${escHtml(c.email)}</span>`);
  if (c.address)  chips.push(`<span style="font-size:.82rem">📍 ${escHtml(c.address)}</span>`);
  if (c.notes)    chips.push(`<span style="font-size:.82rem;font-style:italic;color:var(--text-muted)">${escHtml(c.notes)}</span>`);
  document.getElementById("company-detail-info").innerHTML = chips.length
    ? chips.map(ch => `<div style="display:flex;align-items:center;gap:6px">${ch}</div>`).join("")
    : `<span style="color:var(--text-muted);font-size:.85rem">No additional info</span>`;

  // Wire up Edit button
  const editBtn = document.getElementById("company-detail-edit-btn");
  editBtn.onclick = () => {
    hideModal("company-detail-modal");
    openEditCompany(c._id, c.name, c.industry||"", c.phone||"", c.email||"", c.address||"", c.notes||"");
  };

  // Linked debtors
  const debtors = (state.debtors || []).filter((d) => d.companyId === companyId);
  const container = document.getElementById("company-detail-debtors");
  if (!debtors.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:.875rem;padding:16px 0">No debtors linked to this company yet.<br>Go to <strong>Debtors</strong> and assign this company to a debtor.</div>`;
  } else {
    const totalOwed = debtors.reduce((s, d) => s + d.totalOwed, 0);
    container.innerHTML = `
      <div style="background:var(--bg-hover);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.85rem;color:var(--text-secondary)">${debtors.length} debtor${debtors.length !== 1 ? "s" : ""}</span>
        <span style="font-weight:700;font-size:1rem;color:var(--danger)">Total Owed: ${fmt(totalOwed)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${debtors.map(d => `
          <div class="transaction-item" style="cursor:pointer" onclick="hideModal('company-detail-modal');openDebtorDetail('${d._id}')">
            <div class="tx-icon" style="background:var(--danger-light);color:var(--danger);width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;flex-shrink:0">
              ${escHtml(d.name[0].toUpperCase())}
            </div>
            <div class="tx-info">
              <div class="tx-category">${escHtml(d.name)}</div>
              <div class="tx-desc">${escHtml(d.phone || d.email || "No contact info")}</div>
            </div>
            <div class="tx-right">
              <div class="tx-amount ${d.status === 'cleared' ? 'income' : 'expense'}">${fmt(d.totalOwed)}</div>
              <div class="tx-date">${statusBadge(d.status)}</div>
            </div>
          </div>
        `).join("")}
      </div>`;
  }

  showModal("company-detail-modal");
};

window.openAddCompanyModal = function () {
  editingCompanyId = null;
  document.getElementById("company-modal-title").textContent = "Add Company";
  document.getElementById("co-submit-text").textContent = "Save Company";
  ["co-name","co-industry","co-phone","co-email","co-address","co-notes"].forEach((id) => { document.getElementById(id).value = ""; });
  hideError("company-modal-error");
  showModal("company-modal");
};

window.openEditCompany = function (id, name, industry, phone, email, address, notes) {
  editingCompanyId = id;
  document.getElementById("company-modal-title").textContent = "Edit Company";
  document.getElementById("co-submit-text").textContent = "Update Company";
  document.getElementById("co-name").value = name;
  document.getElementById("co-industry").value = industry;
  document.getElementById("co-phone").value = phone;
  document.getElementById("co-email").value = email;
  document.getElementById("co-address").value = address;
  document.getElementById("co-notes").value = notes;
  hideError("company-modal-error");
  showModal("company-modal");
};

window.submitCompany = async function () {
  const name = sanitize(document.getElementById("co-name").value);
  if (!name) { setFieldError("co-name-err", "Name is required"); return; }
  clearFieldErrors(["co-name-err"]);
  const payload = {
    token: state.token,
    name,
    industry: sanitize(document.getElementById("co-industry").value) || undefined,
    phone: sanitize(document.getElementById("co-phone").value) || undefined,
    email: sanitize(document.getElementById("co-email").value) || undefined,
    address: sanitize(document.getElementById("co-address").value) || undefined,
    notes: sanitize(document.getElementById("co-notes").value) || undefined,
  };
  try {
    hideError("company-modal-error");
    if (editingCompanyId) {
      await client.mutation("companies:updateCompany", { ...payload, companyId: editingCompanyId });
      showToast("Company updated", "success");
    } else {
      await client.mutation("companies:createCompany", payload);
      showToast("Company added", "success");
    }
    editingCompanyId = null;
    hideModal("company-modal");
    await loadCompanies();
  } catch (err) {
    console.error("Company error:", err);
    showError("company-modal-error", errMsg(err));
  }
};

window.deleteCompany = function (companyId, name) {
  showConfirm(`Delete "${name}"?`, "Linked debtors will be unlinked but not deleted.", async () => {
    try {
      await client.mutation("companies:deleteCompany", { token: state.token, companyId });
      await loadCompanies();
      showToast("Company deleted", "success");
    } catch (err) {
      showToast(errMsg(err), "error");
    }
  });
};

// ═══════════════════════════ DEBTORS ═════════════════════════════════
async function loadDebtors() {
  const [summary, debtors, companies] = await Promise.all([
    client.query("debtors:getDebtorsSummary", { token: state.token }),
    client.query("debtors:getDebtors", { token: state.token }),
    client.query("companies:getCompanies", { token: state.token }),
  ]);

  state.debtors = debtors;
  state.companies = companies;
  populateCompanySelect();

  // Stats
  document.getElementById("debtors-stats").innerHTML = `
    <div class="debt-stat-card">
      <div class="debt-stat-value" style="color:var(--danger)">${fmt(summary.totalReceivables)}</div>
      <div class="debt-stat-label">Total Receivables</div>
    </div>
    <div class="debt-stat-card">
      <div class="debt-stat-value" style="color:var(--danger)">${summary.activeCount}</div>
      <div class="debt-stat-label">Active</div>
    </div>
    <div class="debt-stat-card">
      <div class="debt-stat-value" style="color:var(--warning)">${summary.partialCount}</div>
      <div class="debt-stat-label">Partial</div>
    </div>
    <div class="debt-stat-card">
      <div class="debt-stat-value" style="color:var(--success)">${summary.clearedCount}</div>
      <div class="debt-stat-label">Cleared</div>
    </div>
  `;

  renderDebtors(debtors, state.debtorFilter);
}

function renderDebtors(debtors, filter) {
  const filtered = filter ? debtors.filter((d) => d.status === filter) : debtors;
  const grid = document.getElementById("debtors-list");
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${svgEmpty()}<p>No debtors found.</p></div>`;
    return;
  }

  // Build a summary table of all debtors at the top
  const summaryRows = debtors.map(d => `
    <tr><td>${escHtml(d.name)}</td><td>${fmt(d.totalOwed)}</td></tr>`).join('');
  const summaryHtml = `
    <div class="debtors-summary" style="margin-bottom:16px;overflow-x:auto;">
      <h3>All Debtors Owed</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;padding:4px;">Name</th><th style="text-align:left;padding:4px;">Amount Owed</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>`;

  grid.innerHTML = summaryHtml + filtered.map((d) => `
    <div class="debtor-card" onclick="openDebtorDetail('${d._id}')">
      <div class="debtor-card-header">
        <div class="debtor-avatar">${escHtml(d.name[0].toUpperCase())}</div>
        <div>
          <div class="debtor-name">${escHtml(d.name)}</div>
          ${(d.companyId && (state.companies||[]).find(c=>c._id===d.companyId)) ? `<div style="font-size:.75rem;font-weight:600;color:var(--primary);margin-top:1px">🏢 ${escHtml((state.companies||[]).find(c=>c._id===d.companyId).name)}</div>` : (d.company ? `<div style="font-size:.75rem;font-weight:600;color:var(--primary);margin-top:1px">🏢 ${escHtml(d.company)}</div>` : "")}
          <div class="debtor-contact">${escHtml(d.phone || d.email || "No contact")}</div>
        </div>
        ${statusBadge(d.status)}
      </div>
      <div class="debtor-card-body">
        <div class="debtor-owed-label">Amount Owed</div>
        <div class="debtor-owed-amount ${d.status === 'cleared' ? 'cleared' : ''}">${fmt(d.totalOwed)}</div>
      </div>
      <div class="debtor-card-footer">
        <div style="font-size:.78rem;color:var(--text-muted)">Updated ${formatDate(d.updatedAt)}</div>
        <div class="debtor-actions" onclick="event.stopPropagation()">
          <button class="acc-action-btn" onclick="openEditDebtor('${d._id}', '${escAttr(d.name)}', '${escAttr(d.companyId||'')}', '${escAttr(d.phone||'')}', '${escAttr(d.email||'')}', '${escAttr(d.notes||'')}')" title="Edit debtor">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="acc-action-btn" style="color:var(--danger);border-color:#FECACA" onclick="confirmDeleteDebtor('${d._id}', '${escAttr(d.name)}')" title="Delete debtor">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  `).join("\n");
}

window.filterDebtors = function (btn, status) {
  document.querySelectorAll(".filter-tab").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.debtorFilter = status;
  renderDebtors(state.debtors, status);
};

window.createDebtor = async function () {
  const name = sanitize(document.getElementById("debtor-name").value);
  const companyId = document.getElementById("debtor-company-id").value || undefined;
  const phone = sanitize(document.getElementById("debtor-phone").value);
  const email = sanitize(document.getElementById("debtor-email").value).toLowerCase();
  const notes = sanitize(document.getElementById("debtor-notes").value);

  clearFieldErrors(["debtor-name-err"]);
  if (!name) { setFieldError("debtor-name-err", "Name is required"); return; }

  // Edit mode
  if (editingDebtorId) {
    try {
      hideError("create-debtor-error");
      await client.mutation("debtors:updateDebtor", {
        token: state.token,
        debtorId: editingDebtorId,
        name, companyId: companyId || undefined, company: undefined, phone: phone || undefined, email: email || undefined, notes: notes || undefined,
      });
      editingDebtorId = null;
      document.getElementById("create-debtor-title").textContent = "Add New Debtor";
      const initRow = document.getElementById("debtor-init-row");
      if (initRow) initRow.style.display = "";
      hideModal("create-debtor-modal");
      clearDebtorForm();
      await loadDebtors();
      showToast("Debtor updated successfully", "success");
    } catch (err) {
      console.error("Update debtor error:", err);
      showError("create-debtor-error", errMsg(err));
    }
    return;
  }

  const initialAmount = parseFloat(document.getElementById("debtor-initial-amount").value) || 0;
  const initialDescription = sanitize(document.getElementById("debtor-initial-desc").value);

  try {
    hideError("create-debtor-error");
    await client.mutation("debtors:createDebtor", {
      token: state.token,
      name,
      companyId: companyId || undefined,
      phone: phone || undefined,
      email: email || undefined,
      notes: notes || undefined,
      initialAmount: initialAmount || undefined,
      initialDescription: initialDescription || undefined,
    });
    hideModal("create-debtor-modal");
    clearDebtorForm();
    await loadDebtors();
    showToast("Debtor added successfully", "success");
  } catch (err) {
    console.error("Create debtor error:", err);
    showError("create-debtor-error", errMsg(err));
  }
};

window.openDebtorDetail = async function (debtorId) {
  const debtor = state.debtors.find((d) => d._id === debtorId);
  if (!debtor) return;

  state.currentDebtor = debtor;

  document.getElementById("debtor-detail-name").textContent = debtor.name;
  document.getElementById("debtor-detail-status").innerHTML =
    (debtor.company ? `<span style="font-size:.78rem;font-weight:600;color:var(--primary);margin-right:6px">🏢 ${escHtml(debtor.company)}</span>` : "") +
    statusBadge(debtor.status);
  document.getElementById("debtor-detail-amount").textContent = fmt(debtor.totalOwed);
  document.getElementById("debtor-detail-amount").style.color = debtor.status === "cleared" ? "var(--success)" : "var(--danger)";

  hideDebtTxForm();
  showModal("debtor-detail-modal");
  await loadDebtLedger(debtorId);
};

async function loadDebtLedger(debtorId) {
  const transactions = await client.query("debtors:getDebtTransactions", { token: state.token, debtorId });
  const tbody = document.getElementById("ledger-tbody");

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No transactions yet</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map((t) => `
    <tr>
      <td>${formatDate(t.date)}</td>
      <td>${escHtml(t.description || "—")}</td>
      <td class="ledger-given">${t.type === "given" ? fmt(t.amount) : "—"}</td>
      <td class="ledger-returned">${t.type === "returned" ? fmt(t.amount) : "—"}</td>
      <td class="ledger-balance ${t.runningBalance === 0 ? 'zero' : 'positive'}">${fmt(t.runningBalance)}</td>
    </tr>
  `).join("");
}

window.showAddDebtTx = function (type) {
  state.currentDebtTxType = type;
  const form = document.getElementById("debt-tx-form");
  form.classList.remove("hidden");
  document.getElementById("debt-tx-btn-text").textContent = type === "given" ? "Record Debt" : "Record Payment";
  document.getElementById("debt-tx-amount").value = "";
  document.getElementById("debt-tx-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("debt-tx-desc").value = "";
  hideError("debt-tx-error");
};

window.hideDebtTxForm = function () {
  document.getElementById("debt-tx-form").classList.add("hidden");
};

window.submitDebtTransaction = async function () {
  const amount = parseFloat(document.getElementById("debt-tx-amount").value);
  const date = document.getElementById("debt-tx-date").value;
  const description = sanitize(document.getElementById("debt-tx-desc").value);

  if (!amount || amount <= 0) { showError("debt-tx-error", "Enter a valid amount"); return; }
  if (!date) { showError("debt-tx-error", "Date is required"); return; }
  if (!state.currentDebtor) return;

  try {
    hideError("debt-tx-error");
    await client.mutation("debtors:addDebtTransaction", {
      token: state.token,
      debtorId: state.currentDebtor._id,
      type: state.currentDebtTxType,
      amount,
      description: description || undefined,
      date: new Date(date).getTime(),
    });

    // Refresh debtor data
    const updatedDebtors = await client.query("debtors:getDebtors", { token: state.token });
    state.debtors = updatedDebtors;
    const updatedDebtor = updatedDebtors.find((d) => d._id === state.currentDebtor._id);
    if (updatedDebtor) {
      state.currentDebtor = updatedDebtor;
      document.getElementById("debtor-detail-amount").textContent = fmt(updatedDebtor.totalOwed);
      document.getElementById("debtor-detail-status").innerHTML = statusBadge(updatedDebtor.status);
      document.getElementById("debtor-detail-amount").style.color = updatedDebtor.status === "cleared" ? "var(--success)" : "var(--danger)";
    }

    hideDebtTxForm();
    await loadDebtLedger(state.currentDebtor._id);
    renderDebtors(state.debtors, state.debtorFilter);
    showToast(state.currentDebtTxType === "given" ? "Debt recorded" : "Payment recorded", "success");
  } catch (err) {
    console.error("Debt transaction error:", err);
    showError("debt-tx-error", errMsg(err));
  }
};

window.confirmDeleteDebtor = function (debtorId, name) {
  showConfirm(`Delete debtor "${name}"?`, "All their transaction history will be permanently deleted.", async () => {
    try {
      await client.mutation("debtors:deleteDebtor", { token: state.token, debtorId });
      hideModal("debtor-detail-modal");
      await loadDebtors();
      showToast("Debtor deleted", "success");
    } catch (err) {
      console.error("Delete debtor error:", err);
      showToast(errMsg(err), "error");
    }
  });
};

// ── Edit debtor (re-uses create modal in edit mode) ──────────────────
let editingDebtorId = null;
window.openEditDebtor = function (debtorId, name, companyId, phone, email, notes) {
  editingDebtorId = debtorId;
  document.getElementById("create-debtor-title").textContent = "Edit Debtor";
  document.getElementById("debtor-name").value = name;
  setTimeout(() => { if (companyId) document.getElementById("debtor-company-id").value = companyId; }, 50);
  document.getElementById("debtor-phone").value = phone;
  document.getElementById("debtor-email").value = email;
  document.getElementById("debtor-notes").value = notes;
  // Hide initial-amount row in edit mode
  const initRow = document.getElementById("debtor-init-row");
  if (initRow) initRow.style.display = "none";
  showModal("create-debtor-modal");
};

window.cancelEditDebtor = function () {
  editingDebtorId = null;
  document.getElementById("create-debtor-title").textContent = "Add New Debtor";
  const initRow = document.getElementById("debtor-init-row");
  if (initRow) initRow.style.display = "";
  hideModal("create-debtor-modal");
  clearDebtorForm();
};

// ── Download ledger as PDF ───────────────────────────────────────────
window.downloadLedgerPdf = async function () {
  const debtor = state.currentDebtor;
  if (!debtor) return;

  const transactions = await client.query("debtors:getDebtTransactions", {
    token: state.token,
    debtorId: debtor._id,
  });

  // Build printable HTML page and trigger browser print-to-PDF
  const rows = transactions.map((t) => `
    <tr>
      <td>${formatDate(t.date)}</td>
      <td>${escHtml(t.description || "—")}</td>
      <td style="color:#EF4444;font-weight:600">${t.type === "given" ? fmt(t.amount) : "—"}</td>
      <td style="color:#10B981;font-weight:600">${t.type === "returned" ? fmt(t.amount) : "—"}</td>
      <td style="font-weight:700;color:${t.runningBalance === 0 ? "#10B981" : "#EF4444"}">${fmt(t.runningBalance)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Ledger – ${escHtml(debtor.name)}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:32px;color:#0f172a;font-size:13px}
    h1{font-size:20px;margin-bottom:4px}
    .sub{color:#64748b;margin-bottom:24px;font-size:13px}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase}
    .active{background:#FEE2E2;color:#DC2626}.partial{background:#FEF3C7;color:#D97706}.cleared{background:#D1FAE5;color:#059669}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#f1f5f9;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border-bottom:2px solid #e2e8f0}
    td{padding:9px 12px;border-bottom:1px solid #e2e8f0}
    .total-row td{font-weight:700;background:#f8fafc;border-top:2px solid #e2e8f0}
    @media print{body{padding:16px}}
  </style></head><body>
  <h1>Debt Ledger – ${escHtml(debtor.name)}</h1>
  <div class="sub">
    ${debtor.phone ? "📞 " + escHtml(debtor.phone) + " &nbsp;&nbsp;" : ""}
    ${debtor.email ? "✉ " + escHtml(debtor.email) + " &nbsp;&nbsp;" : ""}
    Status: <span class="badge ${debtor.status}">${capitalize(debtor.status)}</span>
    &nbsp;&nbsp; Printed: ${new Date().toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric"})}
  </div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Given (Owed)</th><th>Returned (Paid)</th><th>Running Balance</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="4">Total Outstanding</td><td style="color:${debtor.totalOwed===0?"#059669":"#DC2626"}">${fmt(debtor.totalOwed)}</td></tr></tfoot>
  </table>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
};

// ── Download combined PDF for all debtors ───────────────────────────────────────
window.downloadCombinedPdf = async function () {
  try {
    // Fetch all debtors (including those without totalOwed field)
    const debtors = await client.query("debtors:listDebtors", { token: state.token });
    if (!debtors || debtors.length === 0) {
      showToast("No debtors to export", "info");
      return;
    }
    const totalOwed = debtors.reduce((s, d) => s + (d.totalOwed || 0), 0);
    const activeCount = debtors.filter(d => d.status === 'active').length;
    const partialCount = debtors.filter(d => d.status === 'partial').length;
    const clearedCount = debtors.filter(d => d.status === 'cleared').length;
    const printDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const statusColor = { active: '#DC2626', partial: '#D97706', cleared: '#059669' };
    const statusBg   = { active: '#FEE2E2', partial: '#FEF3C7', cleared: '#D1FAE5' };

    const rows = debtors.map((d, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="padding:10px 14px;font-weight:600">${escHtml(d.name)}</td>
        <td style="padding:10px 14px;color:#64748b;font-size:12px">${escHtml(d.phone || d.email || '—')}</td>
        <td style="padding:10px 14px;text-align:center">
          <span style="background:${statusBg[d.status]||'#e2e8f0'};color:${statusColor[d.status]||'#475569'};padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase">${d.status || 'active'}</span>
        </td>
        <td style="padding:10px 14px;text-align:right;font-weight:700;color:${d.totalOwed === 0 ? '#059669' : '#DC2626'}">${fmt(d.totalOwed)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>All Debtors Ledger</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;padding:36px;color:#0f172a;font-size:13px;background:#fff}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;border-bottom:3px solid #0f172a;padding-bottom:16px}
      .header h1{font-size:22px;font-weight:800;letter-spacing:-0.5px}
      .header .meta{text-align:right;color:#64748b;font-size:12px;line-height:1.7}
      .stats{display:flex;gap:16px;margin-bottom:24px}
      .stat{flex:1;background:#f1f5f9;border-radius:8px;padding:14px 16px}
      .stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
      .stat-value{font-size:18px;font-weight:800;color:#0f172a}
      .stat-value.red{color:#DC2626}
      table{width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
      thead tr{background:#0f172a;color:#fff}
      thead th{padding:11px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
      thead th:last-child{text-align:right}
      tfoot tr{background:#f1f5f9}
      tfoot td{padding:11px 14px;font-weight:700;font-size:13px;border-top:2px solid #e2e8f0}
      tfoot td:last-child{text-align:right;color:#DC2626;font-size:15px}
      .footer{margin-top:20px;text-align:center;color:#94a3b8;font-size:11px}
      @media print{body{padding:16px}}
    </style></head><body>
      <div class="header">
        <div><h1>All Debtors Ledger</h1><div style="color:#64748b;font-size:12px;margin-top:4px">Outstanding receivables summary</div></div>
        <div class="meta"><div>Printed: ${printDate}</div><div>${debtors.length} debtor${debtors.length !== 1 ? 's' : ''}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-label">Total Outstanding</div><div class="stat-value red">${fmt(totalOwed)}</div></div>
        <div class="stat"><div class="stat-label">Active</div><div class="stat-value">${activeCount}</div></div>
        <div class="stat"><div class="stat-label">Partial</div><div class="stat-value">${partialCount}</div></div>
        <div class="stat"><div class="stat-label">Cleared</div><div class="stat-value">${clearedCount}</div></div>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th style="text-align:right">Amount Owed</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3">Total Outstanding</td><td>${fmt(totalOwed)}</td></tr></tfoot>
      </table>
      <div class="footer">Generated by FinTrack &bull; ${printDate}</div>
      <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  } catch (err) {
    console.error('Combined PDF error:', err);
    showToast(errMsg(err), 'error');
  }
};


function clearDebtorForm() {
  document.getElementById("debtor-name").value = "";
  document.getElementById("debtor-company-id").value = "";
  document.getElementById("debtor-phone").value = "";
  document.getElementById("debtor-email").value = "";
  document.getElementById("debtor-notes").value = "";
  document.getElementById("debtor-initial-amount").value = "";
  document.getElementById("debtor-initial-desc").value = "";
}

// ═══════════════════════════ HELPERS ═════════════════════════════════
function populateAccountSelects() {
  const accounts = state.accounts;
  const txSel = document.getElementById("tx-account");
  const txToSel = document.getElementById("tx-to-account");
  const filterSel = document.getElementById("tx-filter-account");

  const opts = accounts.map((a) => `<option value="${a._id}">${escHtml(a.name)}</option>`).join("");
  const nonSavingsOpts = accounts.filter((a) => a.type !== "savings").map((a) => `<option value="${a._id}">${escHtml(a.name)}</option>`).join("");

  if (txSel) txSel.innerHTML = `<option value="">Select account...</option>` + opts;
  if (txToSel) txToSel.innerHTML = opts;
  if (filterSel) filterSel.innerHTML = `<option value="">All Accounts</option>` + opts;

  populateCategorySelect(state.currentTxType);
}

function fmt(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return "—";
  const n = Number(amount);
  const abs = Math.abs(n);
  // Drop .00 when value is a whole number
  const hasPence = abs % 1 !== 0;
  const formatted = abs.toLocaleString("en-GB", {
    minimumFractionDigits: hasPence ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return (n < 0 ? "-" : "") + "£" + formatted;
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function getMonthEnd() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, "\\'");
}

function sanitize(val) {
  return String(val || "").trim().replace(/[<>]/g, "");
}

function statusBadge(status) {
  const cls = { active: "badge-active", partial: "badge-partial", cleared: "badge-cleared" };
  return `<span class="debtor-status-badge ${cls[status] || ''}">${capitalize(status)}</span>`;
}

function emptyState(msg) {
  return `<div class="empty-state" style="padding:24px">${svgEmpty()}<p>${msg}</p></div>`;
}

function svgEmpty() {
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 17H5a2 2 0 00-2 2v0a2 2 0 002 2h14a2 2 0 002-2v0a2 2 0 00-2-2h-4"/><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/></svg>`;
}

// ═══════════════════════════ MODAL HELPERS ════════════════════════════
window.showModal = function (id) {
  document.getElementById(id)?.classList.remove("hidden");
};

window.hideModal = function (id) {
  document.getElementById(id)?.classList.add("hidden");
};

// Close modal on overlay click
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// Confirm modal
let confirmCallback = null;
function showConfirm(title, message, callback) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  confirmCallback = callback;
  showModal("confirm-modal");
  document.getElementById("confirm-btn").onclick = async () => {
    hideModal("confirm-modal");
    await callback();
  };
}

// ═══════════════════════════ TOAST ═══════════════════════════════════
window.showToast = function (message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✓", error: "✕", warning: "⚠" };
  toast.innerHTML = `<span>${icons[type] || "i"}</span> ${escHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

// ═══════════════════════════ ERROR HELPERS ════════════════════════════
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearFieldErrors(ids) {
  ids.forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = ""; });
}

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const txt = btn.querySelector(".btn-text");
  const loader = btn.querySelector(".btn-loader");
  btn.disabled = loading;
  if (loading) { txt?.classList.add("hidden"); loader?.classList.remove("hidden"); }
  else { txt?.classList.remove("hidden"); loader?.classList.add("hidden"); }
}

// ═══════════════════════════ PASSWORD STRENGTH ════════════════════════
function updatePasswordStrength() {
  const pw = document.getElementById("reg-password").value;
  const fill = document.getElementById("pw-strength-fill");
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;

  const pct = (score / 5) * 100;
  const colors = ["#EF4444", "#F59E0B", "#EAB308", "#10B981", "#059669"];
  fill.style.width = pct + "%";
  fill.style.background = colors[score - 1] || "#EF4444";
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => m.classList.add("hidden"));
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => m.classList.add("hidden"));
  }
});
