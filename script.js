/* --- 1. Storage Module --- */
const Storage = {
  getUsers: () => JSON.parse(localStorage.getItem("ht_users")) || [],
  saveUsers: (users) => localStorage.setItem("ht_users", JSON.stringify(users)),
  getCurrentUser: () => localStorage.getItem("ht_current_user"),
  setCurrentUser: (username) =>
    localStorage.setItem("ht_current_user", username),
  logout: () => localStorage.removeItem("ht_current_user"),
  getUserData: (username) => {
    const data = localStorage.getItem(`ht_data_${username}`);
    return data ? JSON.parse(data) : null;
  },
  saveUserData: (username, data) =>
    localStorage.setItem(`ht_data_${username}`, JSON.stringify(data)),
  deleteUser: (username) => {
    localStorage.removeItem(`ht_data_${username}`);
    let users = Storage.getUsers();
    users = users.filter((u) => u.username !== username);
    Storage.saveUsers(users);
    Storage.logout();
  },
  clearAllData: () => localStorage.clear(),
  getMasterPass: () => localStorage.getItem("ht_master_pass"),
  saveMasterPass: (pass) => localStorage.setItem("ht_master_pass", pass),
  getAdminEmail: () => localStorage.getItem("ht_admin_email"),
  saveAdminEmail: (email) => localStorage.setItem("ht_admin_email", email),
  resetAdminSecurityOnly: () => {
    localStorage.removeItem("ht_master_pass");
    localStorage.removeItem("ht_admin_email");
  },

  // ===== FULL BACKUP SYSTEM =====
  getAllBackupData: () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      data[key] = localStorage.getItem(key);
    }
    return data;
  },

  restoreFullBackup: (backupData) => {
    localStorage.clear();
    for (let key in backupData) {
      localStorage.setItem(key, backupData[key]);
    }
  },
};

/* --- 2. Application Logic --- */
const App = {
  currentUser: null,
  data: null,
  draftData: {},
  selectedDay: new Date().getDate(),
  generatedOtp: null,
  adminAction: null,
  tempHabitList: [],
  statView: "monthly",
  isGraphVisible: false,
  lastScrollPos: 0,

  init() {
    this.selectedDay = new Date().getDate();
    Storage.logout();
    this.currentUser = null;
    this.renderLogin();
  },

  loadUserData() {
    const rawData = Storage.getUserData(this.currentUser);
    if (rawData) {
      this.data = rawData;
      if (this.data.habits) {
        this.data.habits.forEach((h) => {
          if (!h.startDate) h.startDate = 1;
          if (!h.details) h.details = "";
        });
      }
      if (!this.data.dailyNotes) this.data.dailyNotes = {};

      this.renderDashboard();

      // Auto-scroll line removed so it stays on Day 1 upon login
    } else {
      this.renderOnboarding(1);
    }
  },

  /* --- VIEW HELPERS --- */
  setStatView(view) {
    this.statView = view;
    this.renderDashboard();
  },

  toggleGraph() {
    this.isGraphVisible = !this.isGraphVisible;
    this.renderDashboard();
  },

  // --- TOAST NOTIFICATIONS ---
  showToast(message, icon = "🔒") {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast-notification";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>${icon}</span> ${message}`;
    toast.classList.add("show");

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  },

  showLockWarning(habitId, day) {
    const btn = document.getElementById(`btn-${habitId}-${day}`);
    if (btn) {
      btn.classList.add("locked-animate");
      setTimeout(() => btn.classList.remove("locked-animate"), 1000);
    }
    this.showToast("Double-click to uncheck!");
  },

  showHabitNameToast() {
    this.showToast("Double-click name for Quick Info", "ℹ️");
  },

  // --- HABIT DETAILS / NOTES FEATURE ---
  openHabitDetailsModal(habitId) {
    const habit = this.data.habits.find((h) => h.id == habitId);
    if (!habit) return;

    const modal = document.createElement("div");
    modal.id = "habit-details-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
                          <div class="modal-box" style="border-top: 4px solid var(--primary); max-width: 450px;">
                              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                                  <h3 style="color:var(--primary); margin:0;">${habit.name}</h3>
                                  <span style="font-size:0.8rem; color:var(--text-muted);">Habit Details</span>
                              </div>
                              
                              <p style="color:#cbd5e1; font-size:0.9rem; margin-bottom:5px;">Description / Notes:</p>
                              <textarea id="habit-detail-text" 
                                  placeholder="Add details about this habit (e.g. 10 pages, 30 mins, etc.)"
                                  style="width:100%; height:120px; background:#0f172a; color:white; border:1px solid #334155; padding:10px; border-radius:6px; resize:vertical; font-family:inherit;">${habit.details || ""}</textarea>
                              
                              <div class="btn-group" style="margin-top:20px;">
                                  <button class="btn btn-secondary" onclick="document.getElementById('habit-details-modal').remove()">Close</button>
                                  <button class="btn btn-primary" onclick="App.saveHabitDetails('${habit.id}')">Save Details</button>
                              </div>
                          </div>`;
    document.body.appendChild(modal);
  },

  saveHabitDetails(habitId) {
    const text = document.getElementById("habit-detail-text").value;
    const habit = this.data.habits.find((h) => h.id == habitId);
    if (habit) {
      habit.details = text;
      this.save();
      document.getElementById("habit-details-modal").remove();
      this.showToast("Details Saved!", "✅");
    }
  },

  drawChart() {
    if (!this.isGraphVisible) return;

    const canvas = document.getElementById("consistencyChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 20;
    const graphHeight = height - padding * 2;
    const graphWidth = width - padding * 2;

    const dailyData = [];
    for (let d = 1; d <= this.data.days; d++) {
      let possible = 0;
      let checks = 0;
      this.data.habits.forEach((h) => {
        const start = h.startDate || 1;
        if (d >= start) {
          possible++;
          if (this.data.progress[`${h.id}_${d}`]) checks++;
        }
      });
      const percent = possible === 0 ? 0 : (checks / possible) * 100;
      dailyData.push(percent);
    }

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    [0, 0.5, 1].forEach((ratio) => {
      const y = height - padding - ratio * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Line
    ctx.beginPath();
    const stepX = graphWidth / (this.data.days - 1);
    dailyData.forEach((pct, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (pct / 100) * graphHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(59, 130, 246, 0.5)");
    gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineTo(padding + (dailyData.length - 1) * stepX, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Points
    dailyData.forEach((pct, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (pct / 100) * graphHeight;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#60a5fa";
      ctx.fill();
      if (index + 1 === this.selectedDay) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  },

  renderLogin() {
    const app = document.getElementById("app");
    app.style.display = "flex";
    app.innerHTML = `
                  <div class="auth-container">
                    <h1 style="color: var(--primary);">HabitPro</h1>
                    <p style="color: var(--text-muted);">Master your days.</p>

                    <div class="input-group">
                      <label>Username</label>
                      <input type="text" id="login-user">
                    </div>

                    <div class="input-group">
                      <label>Password</label>
                      <input type="password" id="login-pass">
                    </div>

                    <button class="btn btn-primary" onclick="App.handleLogin()">
                      Login / Create Account
                    </button>

                    <div class="auth-actions">
                      <button class="btn btn-secondary" onclick="App.triggerAdminAction('VIEW_ACCOUNTS')">
                        Saved Accounts 🔒
                      </button>
                      <button class="btn btn-danger" onclick="App.triggerAdminAction('RESET_APP')">
                        Reset App ⚠
                      </button>
                    </div>

                    <div class="backup-restore-bar" style="margin-top: 20px; display: flex; justify-content: center; gap: 20px;">
                      <div class="icon-with-text">
                          <button class="icon-btn" title="Save Backup" style="--c1:#22d3ee; --c2:#6366f1; --c3:#a855f7;" onclick="App.handleBackup()">💾</button>
                          <span>Backup</span>
                      </div>

                      <div class="icon-with-text">
                          <button class="icon-btn" title="Restore Data" style="--c1:#facc15; --c2:#fb7185; --c3:#f97316;" onclick="App.handleRestore()">📂</button>
                          <span>Restore</span>
                      </div>

                      <div class="icon-with-text">
                          <button class="icon-btn" title="Clear & New Data" style="--c1:#ef4444; --c2:#dc2626; --c3:#b91c1c;" onclick="App.handleNewData()">✨</button>
                          <span>New Data</span>
                      </div>
                  </div>

                    <p id="auth-error" class="auth-error"></p>
                  </div>
                `;
  },

  selectDay(day) {
    this.selectedDay = day;
    this.renderDashboard(); // Refresh UI to show correct note and highlight
  },

  saveDailyNote(text) {
    if (!this.data.dailyNotes) this.data.dailyNotes = {};
    this.data.dailyNotes[this.selectedDay] = text;
    this.save();
  },

  resetCurrentNote() {
    if (confirm("Clear note for this day?")) {
      if (!this.data.dailyNotes) this.data.dailyNotes = {};
      this.data.dailyNotes[this.selectedDay] = "";
      this.save();
      this.renderDashboard();
    }
  },

  goToToday() {
    const today = new Date().getDate();
    // Check if today matches configured month (simplified for now to just jump to number)
    if (today <= this.data.days) {
      this.selectedDay = today;
      this.renderDashboard();

      // Auto scroll
      setTimeout(() => {
        const container = document.getElementById("tracker-scroll-container");
        if (container) {
          const offset = (today - 1) * 45;
          container.scrollTo({ left: offset, behavior: "smooth" });
        }
      }, 100);
      this.showToast(`Jumped to Day ${today}`, "📅");
    }
  },

  handleNewData() {
    // Step 1: Popup asking for Backup
    if (
      confirm(
        "New Data create karne se pahle Backup lena chahte hain?\n\nOK = Save Backup & Reset\nCancel = No Backup, Direct Reset",
      )
    ) {
      // User clicked OK -> Save Backup
      this.handleBackup();

      // Wait a bit for download to start, then Reset
      setTimeout(() => {
        if (
          confirm("Backup download start ho gaya hai. Ab data clear karein?")
        ) {
          Storage.clearAllData();
          location.reload();
        }
      }, 1000);
    } else {
      // User clicked Cancel -> No Backup, Just Reset
      if (
        confirm("Warning: Bina backup ke sara data delete ho jayega. Continue?")
      ) {
        Storage.clearAllData();
        location.reload();
      }
    }
  },

  renderDashboard() {
    const app = document.getElementById("app");
    const scrollContainer = document.getElementById("tracker-scroll-container");
    if (scrollContainer) {
      this.lastScrollPos = scrollContainer.scrollLeft;
    }

    app.style.display = "block";

    // --- Calculation Logic (Same as your original) ---
    const totalChecks = Object.values(this.data.progress).filter(
      Boolean,
    ).length;
    let totalPossible = 0;
    this.data.habits.forEach((h) => {
      const start = h.startDate || 1;
      totalPossible += this.data.days - start + 1;
    });
    const monthlyPercent =
      totalPossible === 0 ? 0 : Math.round((totalChecks / totalPossible) * 100);

    // --- Weekly Logic (Same as your original) ---
    let weeklyHTML = "";
    let currentDayIter = 1;
    let weekCount = 1;

    while (currentDayIter <= this.data.days) {
      let endDay = currentDayIter + 6;
      let label = `Week ${weekCount}`;
      if (weekCount > 4 && endDay > this.data.days) endDay = this.data.days;
      else if (endDay > this.data.days) endDay = this.data.days;

      let rangePossible = 0;
      let rangeChecks = 0;
      const isCurrentWeek =
        this.selectedDay >= currentDayIter && this.selectedDay <= endDay;

      for (let d = currentDayIter; d <= endDay; d++) {
        this.data.habits.forEach((h) => {
          if (d >= (h.startDate || 1)) {
            rangePossible++;
            if (this.data.progress[`${h.id}_${d}`]) rangeChecks++;
          }
        });
      }
      const rangePercent =
        rangePossible === 0
          ? 0
          : Math.round((rangeChecks / rangePossible) * 100);
      const borderStyle = isCurrentWeek
        ? "border: 1px solid var(--primary); padding: 5px; border-radius: 6px;"
        : "padding: 5px;";

      weeklyHTML += `
                              <div style="margin-bottom: 8px; ${borderStyle}">
                                  <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.8rem; margin-bottom:2px;">
                                      <span>${label} (${currentDayIter}-${endDay})</span>
                                      <span id="week-stat-${weekCount}">${rangePercent}%</span>
                                  </div>
                                  <div style="height: 4px; background: #334155; border-radius: 2px; overflow: hidden;">
                                      <div id="week-bar-${weekCount}" style="height: 100%; width: ${rangePercent}%; background: ${rangePercent === 100 ? "#10b981" : "#6366f1"}; transition: width 0.5s;"></div>
                                  </div>
                              </div>`;
      currentDayIter = endDay + 1;
      weekCount++;
    }

    // --- Graph & Stat View Logic (Same as original) ---
    let currentWeekPercent = 0;
    let wStart = 1;
    while (wStart <= this.data.days) {
      let wEnd = wStart + 6;
      if (wEnd > this.data.days) wEnd = this.data.days;
      if (this.selectedDay >= wStart && this.selectedDay <= wEnd) {
        let wp = 0,
          wc = 0;
        for (let d = wStart; d <= wEnd; d++) {
          this.data.habits.forEach((h) => {
            if (d >= (h.startDate || 1)) {
              wp++;
              if (this.data.progress[`${h.id}_${d}`]) wc++;
            }
          });
        }
        currentWeekPercent = wp === 0 ? 0 : Math.round((wc / wp) * 100);
        break;
      }
      wStart = wEnd + 1;
    }

    const displayPercent =
      this.statView === "monthly" ? monthlyPercent : currentWeekPercent;
    const displayLabel =
      this.statView === "monthly"
        ? "Monthly Progress"
        : "Current Week Progress";

    // --- Header & Date Logic ---
    const todayObj = new Date();
    const currentRealDate = todayObj.getDate();
    const monthIndex = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ].indexOf(this.data.month);
    const year = parseInt(this.data.year);
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let headerHTML = `
                          <div class="grid-header" style="align-content:center; display:flex; flex-direction:column; justify-content:center;">
                              <h1 class="premium-header-habit"><span class="rgb-text-effect-HABIT">HABITS</span></h1> 
                              <button onclick="App.showManageHabitsModal()" class="edit-habits-link"><span class="icon">✏️</span> <span class="text">Edit Habits</span></button>
                          </div>`;

    for (let d = 1; d <= this.data.days; d++) {
      const dObj = new Date(year, monthIndex, d);
      const dName = weekDays[dObj.getDay()];
      const isSunday = dName === "Sun";
      const isSelected = d === this.selectedDay;
      const selectedStyle = isSelected
        ? "background: rgba(99, 102, 241, 0.2); border: 1px solid var(--primary); border-radius: 4px;"
        : "";
      const isTodayMarker =
        d === currentRealDate ? "border-bottom: 2px solid var(--primary);" : "";

      // FIXED: Added selectDay call correctly
      headerHTML += `
                          <div id="header-day-${d}" class="grid-header" onclick="App.selectDay(${d})"
                                  style="display:flex; flex-direction:column; justify-content:center; align-items:center; line-height:1.2; cursor:pointer; ${selectedStyle} ${isTodayMarker}">
                              <span style="font-size:1rem; font-weight:bold;">${d}</span>
                              <span style="font-size:0.65rem; text-transform:uppercase; ${isSunday ? "color:#ef4444;" : "color:var(--text-muted);"}">${dName}</span>
                          </div>`;
    }

    // --- Top Habits Logic ---
    const topHabitsList = this.data.habits
      .filter((h) => h.isTop)
      .map((h) => {
        let completedCount = 0;
        let activeDays = 0;
        for (let d = 1; d <= this.data.days; d++) {
          if (d >= (h.startDate || 1)) {
            activeDays++;
            if (this.data.progress[`${h.id}_${d}`]) completedCount++;
          }
        }
        const hPercent =
          activeDays === 0
            ? 0
            : Math.round((completedCount / activeDays) * 100);
        return `<li style="margin-bottom: 15px;">
                              <div style="display:flex; justify-content:space-between; color: #f8fafc; font-weight:500; font-size: 0.95rem; margin-bottom: 6px;">
                                  <span>${h.name}</span><span id="prio-percent-${h.id}" style="font-size:0.8rem; color:var(--primary);">${hPercent}%</span>
                              </div>
                              <div style="height: 6px; background: #334155; border-radius: 4px; overflow: hidden;">
                                  <div id="prio-bar-${h.id}" style="height: 100%; width: ${hPercent}%; background: var(--primary); transition: width 0.5s;"></div>
                              </div>
                          </li>`;
      })
      .join("");

    // FIXED: Date Options for Notes Dropdown
    let dateOptionsHTML = "";
    for (let i = 1; i <= this.data.days; i++) {
      const isSel = i === this.selectedDay ? "selected" : "";
      dateOptionsHTML += `<option value="${i}" ${isSel}>${this.data.month} ${i}</option>`;
    }

    // FIXED: Get Current Note for Selected Day
    if (!this.data.dailyNotes) this.data.dailyNotes = {};
    const currentNote = this.data.dailyNotes[this.selectedDay] || "";

    const userInitial = this.currentUser
      ? this.currentUser.charAt(0).toUpperCase()
      : "U";
    const chartClass = this.isGraphVisible ? "visible" : "";
    const toggleBtnText = this.isGraphVisible ? "Hide Graph" : "Show Graph 📈";

    app.innerHTML = `
                              <div class="dashboard-header">
                                  <h1 class="premium-header">
                                      <div><span class="rgb-text-effect">${this.data.month}</span> <span class="rgb-text-effect secondary-glow">${this.data.year}</span></div>
                                      <button id="logout" onclick="App.logout()" title="Logout">Logout</button>    
                                  </h1>
                                  <p class="unstoppable-momentum">Track your progress and build unstoppable momentum.</p>
                                  <div class="profile_info">
                                      <div class = "profile-info-container">
                                          <div class="premium-avatar-wrapper"><div class="glow-layer"></div><div class="rotating-border"></div><div class="avatar-inner">${userInitial}</div></div>
                                          <div style="display: flex; flex-direction: column;"><span style="font-size: 0.9rem; font-weight: 600; color: white;">${this.currentUser}</span></div>
                                      </div>
                                  </div>
                              </div>
              <div class="tracker-glow-wrapper">
                              <div id="tracker-scroll-container" class="tracker-container habit-grid-wrapper" style="overflow-x: auto; white-space: nowrap; padding-bottom: 10px;">
                                      <div class="habit-table" style="grid-template-columns: 200px repeat(${this.data.days}, 45px);">
                                          ${headerHTML}
                                          ${this.renderHabitRows()}
                                      </div>
                                  </div>
                              </div>
              <div class="dashboard-grid dashboard-grid-1">
              <div class="stats-sidebar stats-sidebar-1">
                <div class="card stat-box stat-box-1">
                              <div class="toggle-btn-group">
                                              <button class="toggle-btn ${this.statView === "monthly" ? "active" : ""}" onclick="App.setStatView('monthly')">Monthly</button>
                                              <button class="toggle-btn ${this.statView === "weekly" ? "active" : ""}" onclick="App.setStatView('weekly')">Weekly</button>
                                          </div>
                                          <h3 class="stat-label-h3">${displayLabel}</h3>
                                          <div id="main-percent" class="value" style=" color: ${this.statView === "weekly" ? "#22d3ee" : "--primary"};">${displayPercent}%</div>
                                          <div style="display:flex; justify-content:space-between; align-items:center;">
                                              <h4 style="margin: 0; font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Consistency Flow</h4>
                                              <button class="chart-toggle-btn premium-glow-btn" onclick="App.toggleGraph()"><span class="btn-text">${toggleBtnText}</span></button>
                                          </div>
              </div>
              </div>
              </div>

                              <div class="dashboard-grid">
                                  <div class="stats-sidebar">
                                      <div class="card stat-box">
                                        
                                          <div id="chart-wrapper" class="${chartClass}"><canvas id="consistencyChart"></canvas></div>
                                          <div id="weekly-container" style="border-top: 1px solid #334155; padding-top: 10px; margin-top: 10px;">${weeklyHTML}</div>
                                      </div>

                                      <div class="card">
                                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                                              <h3 style="color:var(--text-muted); font-size:0.85rem; letter-spacing:1px; text-transform: uppercase; margin:0;">Top Priorities</h3>
                                              <button onclick="App.showEditPrioritiesModal()" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:0.8rem; text-decoration:underline;">Edit</button>
                                          </div>
                                          <ul style="list-style: none; padding: 0; margin: 0;">${topHabitsList || '<p style="color:var(--text-muted); font-size:0.9rem;">No priorities set.</p>'}</ul>
                                      </div>
                                      
                                      <div class="card">
                                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                                            <h3 style="margin:0;">Notes</h3>
                                            <div style="display:flex; gap:5px; align-items:center;">
                                                <select onchange="App.selectDay(parseInt(this.value))" style="background: #334155; color: white; border: 1px solid #475569; padding: 4px 8px; border-radius: 4px; outline: none; cursor: pointer; font-size: 0.85rem;">${dateOptionsHTML}</select>
                                                <button onclick="App.resetCurrentNote()" title="Clear Note" style="background:none; border:none; cursor:pointer; font-size:1rem;">🗑️</button>
                                                <button onclick="App.goToToday()" style="font-size:0.75rem; background:var(--primary); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Go Today</button>
                                            </div>
                                          </div>
                                          <textarea id="notes-area" placeholder="Type notes for ${this.data.month} ${this.selectedDay}..." style="width:100%; height:100px; background:#1e293b; color:white; border:1px solid #334155; padding:10px; border-radius:6px; resize:none;" oninput="App.saveDailyNote(this.value)">${currentNote}</textarea>
                                      </div>
                                  </div>
                                  
                                  
                                  <div style="margin-top: auto;">
                                          <button class="btn btn-secondary" onclick="App.resetData()" style="margin-top: 2rem; width:100%; border-color: var(--danger); color: var(--danger);">Clear All Ticks (Reset)</button>
                                          <button class="btn btn-danger" style="margin-top: 10px;" onclick="App.showDeleteModal()">Delete Account Permanently</button>
                                      </div>
                              </div>`;

    const newScrollContainer = document.getElementById(
      "tracker-scroll-container",
    );
    if (newScrollContainer) {
      newScrollContainer.scrollLeft = this.lastScrollPos;
    }

    this.drawChart();
  },

  renderHabitRows() {
    const today = new Date();
    const currentRealYear = today.getFullYear();
    const currentRealMonth = today.getMonth();
    const currentRealDate = today.getDate();
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const setupMonthIndex = months.indexOf(this.data.month);
    const setupYear = parseInt(this.data.year);

    return this.data.habits
      .map((habit) => {
        let rowHtml = `
                          <div style="position: sticky; left: 0; background: #1e293b; z-index: 20; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border-right: 1px solid #334155;">
                              <span title="Double click for details" 
                                    style="cursor: pointer; flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 5px; color: white;"
                                    onclick="App.showHabitNameToast()" 
                                    ondblclick="App.showHabitInfo('${habit.id}')">
                                    ${habit.name}
                              </span>
                              <button onclick="App.openHabitDetailsModal('${habit.id}')" title="Habit Details / Add Notes" 
                                      style="background:none; border:none; cursor:pointer; font-size:1rem; opacity: 0.7; transition: opacity 0.2s;"
                                      onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">
                                  📝
                              </button>
                          </div>`;

        const startDay = habit.startDate || 1;

        for (let day = 1; day <= this.data.days; day++) {
          const key = `${habit.id}_${day}`;
          const isDone = this.data.progress[key] === true;
          const isSelected = day === this.selectedDay;
          const bgStyle = isSelected ? "background: rgba(99,102,241,0.1);" : "";

          let isDisabled = false;
          if (setupYear > currentRealYear) isDisabled = true;
          else if (setupYear === currentRealYear) {
            if (setupMonthIndex > currentRealMonth) isDisabled = true;
            else if (
              setupMonthIndex === currentRealMonth &&
              day > currentRealDate
            )
              isDisabled = true;
          }
          if (day < startDay) isDisabled = true;

          rowHtml += `<div style="display:flex; justify-content:center; align-items:center; ${bgStyle}">`;

          if (isDisabled) {
            rowHtml += `<button class="check-btn" disabled style="opacity: 0.15; cursor: not-allowed; background: #333;">🔒</button>`;
          } else if (isDone) {
            rowHtml += `<button id="btn-${habit.id}-${day}" class="check-btn completed" title="Double-click to undo" 
                                              onclick="App.showLockWarning('${habit.id}', ${day})" 
                                              ondblclick="App.uncheckHabit('${habit.id}', ${day})">✓</button>`;
          } else {
            rowHtml += `<button id="btn-${habit.id}-${day}" class="check-btn" onclick="App.checkHabit('${habit.id}', ${day})"></button>`;
          }

          rowHtml += `</div>`;
        }
        return rowHtml;
      })
      .join("");
  },

  /* --- MANAGE HABITS MODAL (UPDATED: Prompt for Start Date) --- */
  showManageHabitsModal() {
    this.tempHabitList = JSON.parse(JSON.stringify(this.data.habits));

    const modal = document.createElement("div");
    modal.id = "manage-habits-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
                          <div class="modal-box" style="max-width:400px;">
                              <h3 style="color:var(--primary); margin-top:0;">Manage Habits</h3>
                              <p style="color:var(--text-muted); font-size:0.8rem;">Add new or rename. <br>New habits start from Today.</p>
                              <div id="manage-list-container" style="max-height:300px; overflow-y:auto; margin-bottom:15px;"></div>
                              <div style="display:flex; justify-content:center; gap:10px; margin-bottom:15px;">
                                  <button onclick="App.addTempHabit()" style="width:30px; height:30px; border-radius:50%; border:none; background:#10b981; color:white; font-weight:bold; cursor:pointer;">+</button>
                              </div>
                              <div class="btn-group">
                                  <button class="btn btn-secondary" onclick="document.getElementById('manage-habits-modal').remove()">Cancel</button>
                                  <button class="btn btn-primary" onclick="App.saveManagedHabits()">Save Changes</button>
                              </div>
                          </div>`;
    document.body.appendChild(modal);
    this.renderManageList();
  },

  renderManageList() {
    const container = document.getElementById("manage-list-container");
    if (!container) return;
    let html = "";
    this.tempHabitList.forEach((h, index) => {
      // Updated to show Start Info cleanly
      const startInfo =
        h.startDate > 1 ? `(Starts Day ${h.startDate})` : "(Starts Day 1)";
      html += `
                              <div style="display:flex; gap:5px; margin-bottom:10px; align-items:center;">
                                  <input type="text" value="${h.name}" onchange="App.updateTempHabitName(${index}, this.value)" style="flex:1; padding:8px; border-radius:4px; border:1px solid #334155; background:#1e293b; color:white;">
                                  <button onclick="App.removeTempHabit(${index})" style="background:none; border:none; cursor:pointer; font-size:1rem;">❌</button>
                              </div>
                              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:-8px; margin-bottom:8px; text-align:left;">${startInfo}</div>`;
    });
    container.innerHTML = html;
  },

  // --- NEW: Add Habit Flow with Start Preference ---
  addTempHabit() {
    // Create popup to ask preference
    const modal = document.createElement("div");
    modal.id = "start-date-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
                          <div class="modal-box" style="text-align:center; max-width:350px; border: 1px solid var(--primary);">
                              <h3 style="color:var(--primary); margin-top:0;">New Habit Start Date</h3>
                              <p style="color:var(--text-muted); font-size:0.9rem;">Choose when to start tracking this habit.</p>
                              <div style="display:flex; flex-direction:column; gap:10px; margin: 20px 0;">
                                  <button class="btn btn-primary" onclick="App.confirmAddHabit(true)">From Today (Lock Past)</button>
                                  <button class="btn btn-secondary" onclick="App.confirmAddHabit(false)">Full Month (Unlock All)</button>
                              </div>
                              <button onclick="document.getElementById('start-date-modal').remove()" style="background:none; border:none; color:#64748b; cursor:pointer;">Cancel</button>
                          </div>`;
    document.body.appendChild(modal);
  },

  confirmAddHabit(isFromToday) {
    const todayDate = new Date().getDate();
    const startDay = isFromToday ? todayDate : 1;

    this.tempHabitList.push({
      id: Date.now(),
      name: "",
      isTop: false,
      startDate: startDay,
      details: "",
    });

    document.getElementById("start-date-modal").remove();
    this.renderManageList();
  },

  removeTempHabit(index) {
    if (confirm("Delete this habit? Progress will be lost.")) {
      this.tempHabitList.splice(index, 1);
      this.renderManageList();
    }
  },

  updateTempHabitName(index, val) {
    this.tempHabitList[index].name = val;
  },

  saveManagedHabits() {
    for (let h of this.tempHabitList) {
      if (!h.name.trim()) {
        alert("Habit names cannot be empty.");
        return;
      }
    }
    this.data.habits = this.tempHabitList;
    this.save();
    document.getElementById("manage-habits-modal").remove();
    this.renderDashboard();
  },

  checkHabit(habitId, day) {
    const key = `${habitId}_${day}`;
    this.data.progress[key] = true;
    this.save();
    this.renderDashboard();
  },

  uncheckHabit(habitId, day) {
    const key = `${habitId}_${day}`;
    delete this.data.progress[key];
    this.save();
    this.renderDashboard();
  },

  showHabitInfo(habitId) {
    const habit = this.data.habits.find((h) => h.id == habitId);
    if (!habit) return;
    const modal = document.createElement("div");
    modal.id = "habit-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-box" style="text-align:center;"><h3 style="color:var(--primary); margin-top:0;">Habit Details</h3><p style="color:white; font-size:1.1rem; margin: 20px 0;">${habit.name}</p><button class="btn btn-primary" onclick="document.getElementById('habit-modal').remove()">Close</button></div>`;
    document.body.appendChild(modal);
  },

  /* --- RESET DATA WITH PASSWORD PROTECTION --- */
  resetData() {
    this.showResetPasswordModal();
  },

  showResetPasswordModal() {
    const modal = document.createElement("div");
    modal.id = "reset-pass-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
                          <div class="modal-box" style="border: 1px solid var(--danger);">
                              <h3 style="color:var(--danger); margin-top:0;">⚠ Reset Progress</h3>
                              <p style="color:var(--text-muted); font-size:0.9rem;">To clear all ticks, enter your password.</p>
                              <div class="input-group">
                                  <label>Password for '${this.currentUser}'</label>
                                  <input type="password" id="reset-verify-pass">
                              </div>
                              <p id="reset-pass-error" style="color:var(--danger); font-size:0.9rem; margin:0;"></p>
                              <div class="btn-group" style="margin-top:15px;">
                                  <button class="btn btn-secondary" onclick="document.getElementById('reset-pass-modal').remove()">Cancel</button>
                                  <button class="btn btn-danger" onclick="App.verifyAndResetData()">Clear Data</button>
                              </div>
                          </div>`;
    document.body.appendChild(modal);
  },

  verifyAndResetData() {
    const passInput = document.getElementById("reset-verify-pass").value.trim();
    const users = Storage.getUsers();
    const userObj = users.find((u) => u.username === this.currentUser);

    if (userObj && userObj.password === passInput) {
      // Password Verified - Clear Ticks Only
      this.data.progress = {};
      this.save();
      this.renderDashboard();
      document.getElementById("reset-pass-modal").remove();
      alert("All progress cleared successfully.");
    } else {
      document.getElementById("reset-pass-error").textContent =
        "Incorrect password.";
    }
  },

  /* --- ADMIN/DELETE ACTIONS --- */
  triggerAdminAction(action) {
    this.adminAction = action;
    if (!Storage.getMasterPass()) this.renderCreateMasterPassModal();
    else
      action === "RESET_APP"
        ? this.renderDoubleAuthModal()
        : this.renderEnterMasterPassModal();
  },

  renderCreateMasterPassModal() {
    const modal = document.createElement("div");
    modal.id = "mp-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-box"><h3 style="color:var(--primary); margin-top:0;">Setup Admin Security</h3><div class="input-group"><label>New Master Password</label><input type="password" id="new-mp"></div><div class="input-group"><label>Recovery Email (For OTP)</label><input type="email" id="rec-email" placeholder="you@gmail.com"></div><p id="setup-error" style="color:var(--danger); font-size:0.8rem; display:none;">All fields required!</p><div class="btn-group"><button class="btn btn-secondary" onclick="document.getElementById('mp-modal').remove()">Cancel</button><button class="btn btn-primary" onclick="App.saveNewMasterPass()">Save & Continue</button></div></div>`;
    document.body.appendChild(modal);
  },
  saveNewMasterPass() {
    const pass = document.getElementById("new-mp").value.trim();
    const email = document.getElementById("rec-email").value.trim();

    if (!pass || !email) {
      alert("Please fill ALL fields.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Invalid Email!");
      return;
    }

    Storage.saveMasterPass(pass);
    Storage.saveAdminEmail(email);
    document.getElementById("mp-modal").remove();
    alert("Security Setup Complete!");
    this.executeAdminAction();
  },

  renderEnterMasterPassModal() {
    const modal = document.createElement("div");
    modal.id = "mp-modal";
    modal.className = "modal-overlay";
    const isReset = this.adminAction === "RESET_APP",
      title = isReset ? "⚠ Factory Reset" : "Admin Access";
    modal.innerHTML = `<div class="modal-box"><h3 style="color:var(--primary); margin-top:0;">${title}</h3><p style="color:var(--text-muted); font-size:0.9rem;">Enter Admin Password.</p><div class="input-group"><label>Master Password</label><input type="password" id="enter-mp"></div><div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;"><p id="mp-error" style="color:var(--danger); font-size:0.9rem; margin:0;"></p><button onclick="App.renderForgotPassOTPModal()" style="background:none; border:none; color:var(--text-muted); text-decoration:underline; cursor:pointer; font-size:0.9rem;">Forgot Password?</button></div><div class="btn-group" style="margin-top:15px;"><button class="btn btn-secondary" onclick="document.getElementById('mp-modal').remove()">Cancel</button><button class="btn btn-primary" onclick="App.verifyMasterPass()">Unlock</button></div></div>`;
    document.body.appendChild(modal);
  },
  verifyMasterPass() {
    if (
      document.getElementById("enter-mp").value.trim() ===
      Storage.getMasterPass()
    ) {
      document.getElementById("mp-modal").remove();
      this.executeAdminAction();
    } else
      document.getElementById("mp-error").textContent = "Incorrect password.";
  },
  renderForgotPassOTPModal() {
    const existing = document.getElementById("mp-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "otp-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-box"><h3 style="color:var(--primary); margin-top:0;">Recovery Verification</h3><p style="color:var(--text-muted);">Enter registered email.</p><div id="otp-step-1"><div class="input-group"><label>Email</label><input type="email" id="recover-email-input" placeholder="e.g. you@gmail.com"></div><button class="btn btn-primary" onclick="App.checkEmailAndSendOtp()" style="width:100%; margin-top:10px;">Verify & Send OTP</button></div><div id="otp-step-2" style="display:none; margin-top:15px;"><div class="input-group"><label>Enter OTP</label><input type="number" id="otp-input" placeholder="XXXX"></div><button class="btn btn-success" onclick="App.verifyOtpAndReset()" style="width:100%; background:#10b981; margin-top:10px;">Verify & Reset Security</button></div><div class="btn-group" style="margin-top:15px;"><button class="btn btn-secondary" onclick="document.getElementById('otp-modal').remove()">Cancel</button></div></div>`;
    document.body.appendChild(modal);
  },
  checkEmailAndSendOtp() {
    const inputEmail = document
      .getElementById("recover-email-input")
      .value.trim();
    const storedEmail = Storage.getAdminEmail();
    if (inputEmail && inputEmail === storedEmail) {
      this.sendOtp(inputEmail);
    } else {
      alert("Error: Email not found.");
    }
  },
  sendOtp(email) {
    const otp = Math.floor(1000 + Math.random() * 9000);
    this.generatedOtp = otp;
    alert(`[SIMULATION]\n\nEmail sent to: ${email}\nYour OTP is: ${otp}`);
    document.getElementById("otp-step-1").style.display = "none";
    document.getElementById("otp-step-2").style.display = "block";
  },
  verifyOtpAndReset() {
    if (
      parseInt(document.getElementById("otp-input").value) === this.generatedOtp
    ) {
      if (
        confirm(
          "OTP Verified! Reset Admin Password now?\n(User Data will remain SAFE)",
        )
      ) {
        Storage.resetAdminSecurityOnly();
        document.getElementById("otp-modal").remove();
        alert("Security Reset Successfully. Please setup new Master Password.");
        this.adminAction = "VIEW_ACCOUNTS";
        this.renderCreateMasterPassModal();
      }
    } else alert("Invalid OTP!");
  },

  renderDoubleAuthModal() {
    const modal = document.createElement("div");
    modal.id = "double-auth-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-box" style="border: 1px solid var(--danger);"><h3 style="color:var(--danger); margin-top:0;">⚠ Factory Reset Security</h3><p style="color:var(--text-muted); font-size:0.9rem;">To delete ALL data, verify your identity.</p><div class="input-group"><label>1. Master Password</label><input type="password" id="da-pass"></div><p id="da-error" style="color:var(--danger); font-size:0.9rem; margin:0;"></p><div style="text-align:right; margin-bottom:10px;"><button onclick="App.renderForgotPassOTPModal()" style="background:none; border:none; color:var(--text-muted); text-decoration:underline; cursor:pointer; font-size:0.8rem;">Forgot Password?</button></div><div class="btn-group"><button class="btn btn-secondary" onclick="document.getElementById('double-auth-modal').remove()">Cancel</button><button class="btn btn-danger" onclick="App.verifyDoubleAuth()">DELETE ALL DATA</button></div></div>`;
    document.body.appendChild(modal);
  },
  verifyDoubleAuth() {
    const pass = document.getElementById("da-pass").value.trim();
    const storedPass = Storage.getMasterPass();

    if (pass === storedPass) {
      if (confirm("FINAL WARNING: This cannot be undone. Wipe everything?")) {
        Storage.clearAllData();
        location.reload();
      }
    } else
      document.getElementById("da-error").textContent = "Verification Failed.";
  },
  executeAdminAction() {
    if (this.adminAction === "VIEW_ACCOUNTS" || !this.adminAction) {
      this.renderAccountsListModal();
    } else if (this.adminAction === "RESET_APP") {
      if (confirm("DANGER: Delete ALL accounts and reset app?")) {
        Storage.clearAllData();
        location.reload();
      }
    }
  },
  renderAccountsListModal() {
    const users = Storage.getUsers();
    if (users.length === 0) {
      alert("No accounts found.");
      return;
    }
    let rowsHtml = "";
    users.forEach((u, index) => {
      const uData = Storage.getUserData(u.username);
      const info = uData
        ? `${uData.month} ${uData.year}`
        : '<span style="color:#666">Not Setup</span>';
      rowsHtml += `<tr style="border-bottom: 1px solid #334155;"><td onclick="App.switchUser('${u.username}')" style="padding:10px; color:var(--primary); cursor:pointer; text-decoration:underline; font-weight:bold;">${u.username} ↗</td><td style="padding:10px; color:#10b981; font-family:monospace;"><span id="pass-txt-${index}">••••••</span><button onclick="App.togglePass(${index}, '${u.password}')" style="background:none; border:none; cursor:pointer; margin-left:5px;">👁️</button></td><td style="padding:10px; color:var(--text-muted); font-size:0.85rem;">${info}</td></tr>`;
    });
    const modal = document.createElement("div");
    modal.id = "accounts-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-box" style="max-width: 550px;"><h3 style="color:var(--primary); margin-top:0;">Saved Accounts</h3><div style="max-height: 300px; overflow-y: auto; margin: 15px 0;"><table style="width: 100%; border-collapse: collapse; text-align: left;"><thead><tr style="border-bottom: 2px solid var(--primary);"><th style="padding:10px; color:var(--text-muted);">User</th><th style="padding:10px; color:var(--text-muted);">Pass</th><th style="padding:10px; color:var(--text-muted);">Data</th></tr></thead><tbody>${rowsHtml}</tbody></table></div><button class="btn btn-secondary" onclick="document.getElementById('accounts-modal').remove()">Close</button></div>`;
    document.body.appendChild(modal);
  },
  switchUser(username) {
    if (confirm(`Login as '${username}'?`)) {
      Storage.setCurrentUser(username);
      this.currentUser = username;
      const m = document.getElementById("accounts-modal");
      if (m) m.remove();
      this.loadUserData();
    }
  },
  togglePass(index, password) {
    const span = document.getElementById(`pass-txt-${index}`);
    span.textContent = span.textContent === "••••••" ? password : "••••••";
  },

  /* --- STANDARD AUTH & ONBOARDING --- */
  handleLogin() {
    const userIn = document.getElementById("login-user").value.trim(),
      passIn = document.getElementById("login-pass").value.trim();
    if (!userIn || !passIn) {
      document.getElementById("auth-error").textContent =
        "Please enter both fields.";
      return;
    }
    const users = Storage.getUsers(),
      existingUser = users.find((u) => u.username === userIn);
    if (existingUser) {
      existingUser.password === passIn
        ? (Storage.setCurrentUser(userIn),
          (this.currentUser = userIn),
          this.loadUserData())
        : (document.getElementById("auth-error").textContent =
            "Incorrect password.");
    } else if (confirm(`User '${userIn}' not found. Create new account?`)) {
      users.push({ username: userIn, password: passIn });
      Storage.saveUsers(users);
      Storage.setCurrentUser(userIn);
      this.currentUser = userIn;
      this.loadUserData();
    }
  },

  renderOnboarding(step = 1) {
    const app = document.getElementById("app");
    app.style.display = "flex";
    const buttonsHtml = `<div class="btn-group"><button class="btn btn-secondary" onclick="App.prevStep(${step})">Back</button><button class="btn btn-primary" onclick="App.nextStep(${step})">${step === 5 ? "Finish" : "Next"}</button></div>`;
    let content = "";
    if (step === 1)
      content = `<h2>Setup Year</h2><div class="input-group"><label>Year</label><input type="number" id="ob-year" value="${this.draftData.year || new Date().getFullYear()}"></div>`;
    else if (step === 2) {
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const opts = months
        .map(
          (m) =>
            `<option value="${m}" ${this.draftData.month === m ? "selected" : ""}>${m}</option>`,
        )
        .join("");
      content = `<h2>Select Month</h2><div class="input-group"><select id="ob-month">${opts}</select></div>`;
    } else if (step === 3)
      content = `<h2>How many habits?</h2><div class="input-group"><input type="number" id="ob-count" value="${this.draftData.habitCount || ""}" placeholder="e.g. 5"></div>`;
    else if (step === 4) {
      const count = this.draftData.habitCount;
      let inputs = "";
      if (!this.draftData.habits) this.draftData.habits = [];
      for (let i = 0; i < count; i++) {
        const val = this.draftData.habits[i]
          ? this.draftData.habits[i].name
          : "";
        inputs += `<div class="input-group"><input type="text" class="habit-name-input" value="${val}" placeholder="Habit ${i + 1} Name"></div>`;
      }
      content = `
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                              <h2 style="margin:0;">Name Habits</h2>
                              <div style="display:flex; gap:10px;">
                                  <button onclick="App.adjustHabitCount(-1)" style="width:30px; height:30px; border-radius:50%; border:none; background:#ef4444; color:white; font-weight:bold; cursor:pointer;">-</button>
                                  <button onclick="App.adjustHabitCount(1)" style="width:30px; height:30px; border-radius:50%; border:none; background:#10b981; color:white; font-weight:bold; cursor:pointer;">+</button>
                              </div>
                          </div>
                          <div style="max-height:300px; overflow-y:auto; margin-bottom:20px;">${inputs}</div>`;
    } else if (step === 5) {
      const habits = this.draftData.habits;
      let checks = habits
        .map(
          (h, i) =>
            `<div style="text-align:left; margin-bottom:10px;"><input type="checkbox" id="top-${i}" value="${h.name}" ${h.isTop ? "checked" : ""}> <label style="display:inline;">${h.name}</label></div>`,
        )
        .join("");
      content = `<h2>Select Key Priorities</h2><div style="margin-bottom:20px;">${checks}</div>`;
    }
    app.innerHTML = `<div class="onboarding-container">${content} ${buttonsHtml}</div>`;
  },

  adjustHabitCount(change) {
    const inputs = document.querySelectorAll(".habit-name-input");
    if (!this.draftData.habits) this.draftData.habits = [];
    inputs.forEach((inp, idx) => {
      if (!this.draftData.habits[idx])
        this.draftData.habits[idx] = {
          id: Date.now() + idx,
          name: "",
          isTop: false,
          startDate: 1,
        };
      this.draftData.habits[idx].name = inp.value;
    });
    if (change > 0) {
      this.draftData.habitCount++;
      this.draftData.habits.push({
        id: Date.now() + Math.random(),
        name: "",
        isTop: false,
        startDate: 1,
      });
    } else {
      if (this.draftData.habitCount > 1) {
        this.draftData.habitCount--;
        this.draftData.habits.pop();
      }
    }
    this.renderOnboarding(4);
  },

  nextStep(currentStep) {
    if (currentStep === 1)
      this.draftData.year = document.getElementById("ob-year").value;
    if (currentStep === 2) {
      this.draftData.month = document.getElementById("ob-month").value;
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const monthIndex = months.indexOf(this.draftData.month);
      this.draftData.days = new Date(
        parseInt(this.draftData.year),
        monthIndex + 1,
        0,
      ).getDate();
    }
    if (currentStep === 3)
      this.draftData.habitCount = parseInt(
        document.getElementById("ob-count").value,
      );
    if (currentStep === 4) {
      const inputs = document.querySelectorAll(".habit-name-input");
      this.draftData.habits = Array.from(inputs).map((inp, idx) => ({
        id: Date.now() + idx,
        name: inp.value || `Habit ${idx + 1}`,
        isTop: false,
        startDate: 1,
      }));
    }
    if (currentStep === 5) this.finishOnboarding();
    else this.renderOnboarding(currentStep + 1);
  },
  prevStep(currentStep) {
    if (currentStep === 1) this.logout();
    else this.renderOnboarding(currentStep - 1);
  },
  finishOnboarding() {
    const inputs = document.querySelectorAll('input[type="checkbox"]:checked');
    const topNames = Array.from(inputs).map((cb) => cb.value);
    this.draftData.habits.forEach((h) => {
      if (topNames.includes(h.name)) h.isTop = true;
    });
    this.draftData.progress = {};
    this.draftData.notes = "";
    this.draftData.dailyNotes = {};
    this.data = JSON.parse(JSON.stringify(this.draftData));
    this.save();
    this.renderDashboard();
  },
  showEditPrioritiesModal() {
    const modal = document.createElement("div");
    modal.id = "edit-priorities-modal";
    modal.className = "modal-overlay";
    let habitsListHTML = "";
    this.data.habits.forEach((h) => {
      const isChecked = h.isTop ? "checked" : "";
      habitsListHTML += `<div style="text-align:left; margin-bottom:10px; display:flex; align-items:center; gap:10px;"><input type="checkbox" id="prio-${h.id}" value="${h.id}" ${isChecked} style="width:18px; height:18px;"><label for="prio-${h.id}" style="color:#e2e8f0; font-size:1rem; cursor:pointer;">${h.name}</label></div>`;
    });
    modal.innerHTML = `<div class="modal-box"><h3 style="color:var(--primary); margin-top:0;">Manage Top Priorities</h3><div id="priority-list-container" style="max-height:300px; overflow-y:auto; margin: 20px 0; border:1px solid var(--border); padding:15px; border-radius:8px; background:var(--bg-input);">${habitsListHTML}</div><div class="btn-group"><button class="btn btn-secondary" onclick="document.getElementById('edit-priorities-modal').remove()">Cancel</button><button class="btn btn-primary" onclick="App.savePriorities()">Save Changes</button></div></div>`;
    document.body.appendChild(modal);
  },
  savePriorities() {
    const container = document.getElementById("priority-list-container");
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const selectedIds = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    this.data.habits.forEach((h) => {
      h.isTop = selectedIds.includes(String(h.id));
    });
    this.save();
    document.getElementById("edit-priorities-modal").remove();
    this.renderDashboard();
  },

  save() {
    Storage.saveUserData(this.currentUser, this.data);
  },
  logout() {
    Storage.logout();
    location.reload();
  },
  showDeleteModal() {
    const modal = document.createElement("div");
    modal.id = "delete-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-box"><h2 style="color:var(--danger); margin-top:0;">⚠ Delete Account</h2><div class="input-group"><label>Username</label><input type="text" id="del-user"></div><div class="input-group"><label>Password</label><input type="password" id="del-pass"></div><p id="del-error" style="color:var(--danger); font-size:0.9rem;"></p><div class="btn-group"><button class="btn btn-secondary" onclick="App.closeDeleteModal()">Cancel</button><button class="btn btn-danger" onclick="App.confirmDelete()">Delete</button></div></div>`;
    document.body.appendChild(modal);
  },
  closeDeleteModal() {
    const m = document.getElementById("delete-modal");
    if (m) m.remove();
  },
  confirmDelete() {
    const u = document.getElementById("del-user").value.trim(),
      p = document.getElementById("del-pass").value.trim();
    if (u !== this.currentUser) {
      document.getElementById("del-error").textContent = "Wrong username.";
      return;
    }
    const users = Storage.getUsers(),
      userObj = users.find((usr) => usr.username === u);
    if (userObj && userObj.password === p) {
      Storage.deleteUser(u);
      alert("Deleted.");
      location.reload();
    } else document.getElementById("del-error").textContent = "Wrong password.";
  },

  // --- Scroll to Today (Called only on Button/Manual Trigger) ---
  scrollToToday() {
    const today = this.selectedDay;
    const container = document.getElementById("tracker-scroll-container");
    if (!container) return;
    const offset = (today - 1) * 45;
    container.scrollTo({ left: offset, behavior: "smooth" });
  },

  // ===== BACKUP / RESTORE =====
  handleBackup() {
    const filename = prompt("Backup file ka naam?");
    if (!filename) return;

    const data = Storage.getAllBackupData();
    const json = JSON.stringify(data, null, 2);

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    a.click();

    URL.revokeObjectURL(url);
    this.showToast("Backup saved!", "💾");
  },

  handleRestore() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const backupData = JSON.parse(event.target.result);
          Storage.restoreFullBackup(backupData);
          alert("Restore successful! Reload ho raha hai.");
          location.reload();
        } catch {
          alert("Invalid backup file!");
        }
      };
      reader.readAsText(file);
    };

    input.click();
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
