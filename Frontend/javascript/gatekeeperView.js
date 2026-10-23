import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const gatekeeperView = {
  lastScannedResult: null,

  async render(container) {
    container.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h1 style="font-size: 1.4rem; font-weight: 800; color: #fff;">🚪 Smart Gatekeeper High-Speed Verification Scanner</h1>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Instant cryptographic QR validation for hostel entry and exit. Server-enforced timestamps & anti-replay protection.</p>
      </div>

      <div class="grid-2" style="margin-bottom: 24px;">
        <!-- Scanner Panel -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><span>📷</span> Gate Camera & Pass Input</div>
            <span class="badge badge-info">Gate: North Main Gate</span>
          </div>

          <div class="scanner-container">
            <div class="scanner-video-preview" id="scanner-box">
              <div class="scanner-laser-line"></div>
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.85rem;">
                <span style="font-size: 2.2rem; margin-bottom: 8px;">📷</span>
                <span>Optical Scanner Ready</span>
                <span style="font-size: 0.72rem; color: var(--text-subtle); margin-top: 4px;">Hold digital pass to camera or select quick pass below</span>
              </div>
            </div>

            <!-- Quick Demo QR Payload Selector / Manual Input -->
            <div style="margin-top: 14px; text-align: left;">
              <label class="form-label" style="font-size: 0.78rem;">Scanned Token String / Quick Test Pass</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="gate-qr-input" class="form-control" placeholder="Paste cryptographic token string or pick below..." />
                <button class="btn btn-primary" onclick="window.gatekeeperView.processInputScan()">
                  Scan Pass
                </button>
              </div>
            </div>

            <!-- One-Click Demo Pass Buttons -->
            <div style="margin-top: 14px; text-align: left;">
              <span style="font-size: 0.74rem; color: var(--text-subtle); display: block; margin-bottom: 6px;">⚡ Quick Test Passes from System:</span>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="gate-quick-passes-container">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Loading active passes...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Verification Output Card -->
        <div class="card" id="gate-verification-card">
          <div class="card-header">
            <div class="card-title"><span>🛡️</span> Pass Verification Result</div>
            <span class="badge badge-gray">Awaiting Scan</span>
          </div>
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <span style="font-size: 2.5rem; display: block; margin-bottom: 10px;">🎫</span>
            <p style="font-size: 0.95rem; font-weight: 600;">No Pass Scanned Yet</p>
            <p style="font-size: 0.8rem; color: var(--text-subtle); margin-top: 4px;">Scan an approved outpass QR to verify student identity and record movement.</p>
          </div>
        </div>
      </div>

      <!-- Live Movement Log Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><span>📜</span> Real-Time Gate Movement Audit Log (Today)</div>
          <button class="btn btn-secondary btn-sm" onclick="window.gatekeeperView.refreshLogs()">🔄 Refresh</button>
        </div>
        <div class="table-container" id="gate-logs-table-container">
          <div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading logs...</div>
        </div>
      </div>
    `;

    await this.loadQuickPasses();
    await this.refreshLogs();
  },

  async loadQuickPasses() {
    const container = document.getElementById('gate-quick-passes-container');
    if (!container) return;

    try {
      const allPasses = await api.getAllOutpasses();
      const activeOrApproved = allPasses.filter(op => op.status === 'APPROVED' || op.status === 'ACTIVE' || op.status === 'OVERDUE');
      
      if (activeOrApproved.length === 0) {
        container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No active/approved passes available. (Request and approve an outpass first)</span>`;
        return;
      }

      container.innerHTML = activeOrApproved.map(op => `
        <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 3px 8px;" onclick="window.gatekeeperView.fillAndScan('${op.qr_payload}')">
          ${op.status === 'APPROVED' ? '🛫 Exit Pass:' : '🛬 Return Pass:'} ${op.student_name} (#${op.outpass_code})
        </button>
      `).join('');
    } catch (err) {
      container.innerHTML = `<span style="color: var(--danger); font-size: 0.75rem;">Error loading passes</span>`;
    }
  },

  fillAndScan(tokenString) {
    document.getElementById('gate-qr-input').value = tokenString;
    this.processInputScan();
  },

  async processInputScan() {
    const qrString = document.getElementById('gate-qr-input')?.value.trim();
    if (!qrString) {
      ui.toast('Please input or select a QR token payload', 'warning');
      return;
    }

    try {
      const res = await api.scanGatePass(qrString, 'MAIN_GATE_NORTH', 'AUTO');
      sound.playGateChime();
      ui.toast(res.message, 'success');
      this.renderVerificationResult(res);
      await this.loadQuickPasses();
      await this.refreshLogs();
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
      this.renderErrorResult(err.message);
    }
  },

  renderVerificationResult(result) {
    const card = document.getElementById('gate-verification-card');
    if (!card) return;

    const std = result.student;
    const op = result.outpass;
    const isExit = result.event_type === 'EXIT';

    card.innerHTML = `
      <div class="card-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
        <div class="card-title" style="color: var(--success);">
          <span>✅</span> ${isExit ? 'EXIT VERIFIED & AUTHORIZED' : 'RETURN RECORDED & CLOSED'}
        </div>
        <span class="badge ${isExit ? 'badge-info' : 'badge-purple'}">${result.event_type} EVENT</span>
      </div>

      <div style="display: flex; gap: 18px; align-items: center; margin-bottom: 18px; background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: var(--radius-md);">
        <img src="${std.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" style="width: 74px; height: 74px; border-radius: 50%; border: 3px solid ${isExit ? '#38bdf8' : '#a855f7'}; object-fit: cover;" />
        <div>
          <h2 style="font-size: 1.3rem; font-weight: 800; color: #fff;">${std.name}</h2>
          <div style="font-size: 0.85rem; color: #a5b4fc; font-weight: 600;">Reg No: ${std.reg_number}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
            Room: <strong>${std.room}</strong> &bull; Block: <strong>${std.block}</strong>
          </div>
        </div>
      </div>

      <div class="grid-2" style="font-size: 0.82rem; gap: 10px; margin-bottom: 16px;">
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Outpass Code</div>
          <div style="font-weight: 700; font-family: monospace; color: #fff;">${op.code}</div>
        </div>
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Destination</div>
          <div style="font-weight: 700; color: #fff;">${op.destination}</div>
        </div>
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Server Timestamp</div>
          <div style="font-weight: 700; color: #34d399;">${new Date(result.timestamp).toLocaleTimeString('en-IN')}</div>
        </div>
        <div style="background: var(--bg-main); padding: 10px; border-radius: 6px;">
          <div style="color: var(--text-subtle);">Return Deadline</div>
          <div style="font-weight: 700; color: ${result.is_overdue ? 'var(--danger)' : '#38bdf8'};">${op.expected_return || 'N/A'}</div>
        </div>
      </div>

      ${result.is_overdue ? `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--danger); border-radius: 8px; padding: 10px; font-size: 0.82rem; color: #fca5a5; margin-bottom: 10px;">
          ⚠️ <strong>OVERDUE RETURN ALERT:</strong> Resident returned after the scheduled deadline. Incident logged in hostel audit records.
        </div>
      ` : ''}

      <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
        🔒 Verified with HMAC Signature & Recorded to Permanent Gate Event Log.
      </div>
    `;
  },

  renderErrorResult(errorMsg) {
    const card = document.getElementById('gate-verification-card');
    if (!card) return;

    card.innerHTML = `
      <div class="card-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
        <div class="card-title" style="color: var(--danger);">
          <span>🚨</span> SECURITY / VERIFICATION ALERT
        </div>
        <span class="badge badge-danger">SCAN REJECTED</span>
      </div>

      <div style="text-align: center; padding: 30px 10px;">
        <span style="font-size: 3rem; display: block; margin-bottom: 12px;">🚫</span>
        <h3 style="font-size: 1.15rem; color: #f87171; font-weight: 700; margin-bottom: 8px;">Gate Movement Denied</h3>
        <p style="font-size: 0.88rem; color: #fca5a5; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: var(--radius-md);">
          ${errorMsg}
        </p>
      </div>
    `;
  },

  async refreshLogs() {
    const container = document.getElementById('gate-logs-table-container');
    if (!container) return;

    try {
      const logs = await api.getGateLogs(15);
      container.innerHTML = `
        <table class="custom-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Student Name</th>
              <th>Reg No</th>
              <th>Room</th>
              <th>Pass Code</th>
              <th>Destination</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? `<tr><td colspan="8" style="text-align:center; padding: 20px; color: var(--text-muted);">No gate events today yet.</td></tr>` : ''}
            ${logs.map(l => `
              <tr>
                <td style="font-weight: 600;">${l.timestamp}</td>
                <td>
                  <span class="badge ${l.event_type === 'EXIT' ? 'badge-info' : 'badge-purple'}">${l.event_type}</span>
                </td>
                <td style="font-weight: 700; color: #fff;">${l.student_name}</td>
                <td style="color: var(--text-muted);">${l.reg_number}</td>
                <td>${l.room_number}</td>
                <td style="font-family: monospace; color: #a5b4fc;">${l.outpass_code}</td>
                <td>${l.destination}</td>
                <td style="font-size: 0.75rem; color: var(--text-subtle);">${l.verification_method}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color: var(--danger); padding: 12px;">Failed to load logs.</p>`;
    }
  }
};

window.gatekeeperView = gatekeeperView;
