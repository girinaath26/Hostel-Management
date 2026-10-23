import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const messStaffView = {
  async render(container) {
    container.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h1 style="font-size: 1.4rem; font-weight: 800; color: #fff;">🍽️ Mess Counter Token Scanner & Analytics</h1>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Real-time token redemption, capacity tracking, and strict anti-duplicate fraud prevention.</p>
      </div>

      <div class="grid-2" style="margin-bottom: 24px;">
        <!-- Scanner & Token Input -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><span>📷</span> Counter Scanner</div>
            <span class="badge badge-success">Mess: Central Mess Hall</span>
          </div>

          <div class="scanner-container">
            <div class="scanner-video-preview">
              <div class="scanner-laser-line"></div>
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.85rem;">
                <span style="font-size: 2.2rem; margin-bottom: 8px;">🍽️</span>
                <span>Mess Counter Scanner Ready</span>
                <span style="font-size: 0.72rem; color: var(--text-subtle); margin-top: 4px;">Scan resident token QR on their phone</span>
              </div>
            </div>

            <!-- Quick Token Input -->
            <div style="margin-top: 14px; text-align: left;">
              <label class="form-label" style="font-size: 0.78rem;">Scanned Token String / Quick Test Token</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="mess-qr-input" class="form-control" placeholder="Scan or paste meal token QR string..." />
                <button class="btn btn-primary" onclick="window.messStaffView.processRedeem()">
                  Redeem Token
                </button>
              </div>
            </div>

            <!-- Quick Token Buttons from Issued Pool -->
            <div style="margin-top: 14px; text-align: left;" id="mess-quick-tokens-container">
              <span style="font-size: 0.74rem; color: var(--text-subtle); display: block; margin-bottom: 6px;">⚡ Quick Test Tokens:</span>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="mess-tokens-list">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Loading active tokens...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Redemption Result Output -->
        <div class="card" id="mess-redemption-card">
          <div class="card-header">
            <div class="card-title"><span>🎫</span> Redemption Status</div>
            <span class="badge badge-gray">Awaiting Token</span>
          </div>
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <span style="font-size: 2.5rem; display: block; margin-bottom: 10px;">🍗</span>
            <p style="font-size: 0.95rem; font-weight: 600;">No Token Scanned</p>
            <p style="font-size: 0.8rem; color: var(--text-subtle); margin-top: 4px;">Scan student's QR to dispense meal and invalidate the token.</p>
          </div>
        </div>
      </div>

      <!-- Meal Schedules & Redemption Stats -->
      <div id="mess-stats-container">
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading meal stats...</div>
      </div>
    `;

    await this.loadQuickTokens();
    await this.refreshStats();
  },

  async loadQuickTokens() {
    const container = document.getElementById('mess-tokens-list');
    if (!container) return;

    try {
      const schedules = await api.getMealSchedules();
      const claimedSchedules = schedules.filter(s => s.has_claimed_token);

      if (claimedSchedules.length === 0) {
        container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No tokens claimed yet by active user. (Claim a token in Student Portal first)</span>`;
        return;
      }

      container.innerHTML = claimedSchedules.map(s => `
        <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 3px 8px;" onclick="window.messStaffView.fillAndRedeem('${s.my_qr_payload}')">
          🍗 ${s.meal_name} (#${s.my_token_code})
        </button>
      `).join('');
    } catch (err) {
      container.innerHTML = `<span style="color: var(--danger); font-size: 0.75rem;">Error loading tokens</span>`;
    }
  },

  fillAndRedeem(tokenPayload) {
    document.getElementById('mess-qr-input').value = tokenPayload;
    this.processRedeem();
  },

  async processRedeem() {
    const qrString = document.getElementById('mess-qr-input')?.value.trim();
    if (!qrString) {
      ui.toast('Please input or select a token QR string', 'warning');
      return;
    }

    try {
      const res = await api.redeemMessToken(qrString);
      sound.playSuccess();
      ui.toast(res.message, 'success');
      this.renderSuccessResult(res);
      await this.refreshStats();
      await this.loadQuickTokens();
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
      this.renderErrorResult(err.message);
    }
  },

  renderSuccessResult(result) {
    const card = document.getElementById('mess-redemption-card');
    if (!card) return;

    const std = result.student;
    const meal = result.meal;

    card.innerHTML = `
      <div class="card-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
        <div class="card-title" style="color: var(--success);">
          <span>✅</span> TOKEN REDEEMED - DISPENSE MEAL
        </div>
        <span class="badge badge-success">VALID TOKEN</span>
      </div>

      <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 18px; background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: var(--radius-md);">
        <img src="${std.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid var(--success); object-fit: cover;" />
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 800; color: #fff;">${std.name}</h2>
          <div style="font-size: 0.85rem; color: #a5b4fc; font-weight: 600;">Reg No: ${std.reg_number}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            Room: <strong>${std.room}</strong> &bull; Block: <strong>${std.block}</strong>
          </div>
        </div>
      </div>

      <div class="grid-2" style="font-size: 0.82rem; gap: 10px; margin-bottom: 16px;">
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Meal</div>
          <div style="font-weight: 700; color: #fff;">${meal.name}</div>
        </div>
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Token Code</div>
          <div style="font-weight: 700; font-family: monospace; color: #a5b4fc;">${result.token_code}</div>
        </div>
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Redeemed At</div>
          <div style="font-weight: 700; color: #34d399;">${result.redeemed_at}</div>
        </div>
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Duplicate Reuse</div>
          <div style="font-weight: 700; color: var(--danger);">LOCKED 🔒</div>
        </div>
      </div>

      <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
        🔒 Token is now permanently marked REDEEMED. Any subsequent scan attempt will trigger fraud detection.
      </div>
    `;
  },

  renderErrorResult(errorMsg) {
    const card = document.getElementById('mess-redemption-card');
    if (!card) return;

    card.innerHTML = `
      <div class="card-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
        <div class="card-title" style="color: var(--danger);">
          <span>🚨</span> MEAL REDEMPTION DENIED
        </div>
        <span class="badge badge-danger">FRAUD ALERT</span>
      </div>

      <div style="text-align: center; padding: 30px 10px;">
        <span style="font-size: 3rem; display: block; margin-bottom: 12px;">🚫</span>
        <h3 style="font-size: 1.15rem; color: #f87171; font-weight: 700; margin-bottom: 8px;">Token Cannot Be Redeemed</h3>
        <p style="font-size: 0.88rem; color: #fca5a5; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: var(--radius-md);">
          ${errorMsg}
        </p>
      </div>
    `;
  },

  async refreshStats() {
    const container = document.getElementById('mess-stats-container');
    if (!container) return;

    try {
      const data = await api.getMessStats();

      container.innerHTML = `
        <div class="card" style="margin-bottom: 24px;">
          <div class="card-header">
            <div class="card-title"><span>📊</span> Today's Meal Schedules & Token Redemptions</div>
          </div>

          <div class="grid-2">
            ${data.schedules.map(s => `
              <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff;">${s.meal_name}</h3>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">${s.meal_date} &bull; ${s.meal_time}</div>
                  </div>
                  <span class="badge badge-info">${s.category}</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; text-align: center;">
                  <div style="background: var(--bg-card); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 1.2rem; font-weight: 800; color: #fff;">${s.total_capacity}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">Total Quota</div>
                  </div>
                  <div style="background: var(--bg-card); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 1.2rem; font-weight: 800; color: #818cf8;">${s.issued_count}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">Tokens Issued</div>
                  </div>
                  <div style="background: var(--bg-card); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 1.2rem; font-weight: 800; color: #34d399;">${s.redeemed_count}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">Redeemed</div>
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--text-muted);">
                  <span>Remaining Slots: <strong>${s.remaining_capacity}</strong></span>
                  <span>No-Show Rate: <strong>${s.no_show_rate}</strong></span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><span>🕒</span> Live Mess Redemption Feed</div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${data.recent_redemptions.length} Recent Scans</span>
          </div>
          <div class="table-container">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Redeemed Time</th>
                  <th>Student Name</th>
                  <th>Reg Number</th>
                  <th>Meal</th>
                  <th>Token Code</th>
                </tr>
              </thead>
              <tbody>
                ${data.recent_redemptions.length === 0 ? `<tr><td colspan="5" style="text-align:center; padding: 16px; color: var(--text-muted);">No redemptions recorded yet today.</td></tr>` : ''}
                ${data.recent_redemptions.map(r => `
                  <tr>
                    <td>${r.redeemed_at}</td>
                    <td style="font-weight: 700; color: #fff;">${r.student_name}</td>
                    <td>${r.reg_number}</td>
                    <td>${r.meal_name}</td>
                    <td style="font-family: monospace; color: #a5b4fc;">${r.token_code}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color: var(--danger);">Failed to load stats.</p>`;
    }
  }
};

window.messStaffView = messStaffView;
