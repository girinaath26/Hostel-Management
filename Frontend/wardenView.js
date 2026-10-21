import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const wardenView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading Chief Warden Dashboard...</div>
    `;

    try {
      const [metrics, attendance, outpasses, rcStatuses, gateLogs] = await Promise.all([
        api.getSystemMetrics(),
        api.getAttendanceSummary(),
        api.getAllOutpasses(),
        api.getRCStatuses(),
        api.getGateLogs(10)
      ]);

      container.innerHTML = `
        <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 1.45rem; font-weight: 800; color: #fff;">🏛️ Chief Warden Executive Command Center</h1>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Hostel-wide analytics, escalated approvals, presence oversight, and security audits.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.wardenView.syncOverdue()">
              🔄 Trigger Overdue Sweep
            </button>
          </div>
        </div>

        <!-- Macro Metrics -->
        <div class="grid-4" style="margin-bottom: 24px;">
          <div class="stat-card">
            <div class="stat-icon primary">🏢</div>
            <div>
              <div class="stat-value">${metrics.total_students}</div>
              <div class="stat-label">Total Residents</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon success">🏠</div>
            <div>
              <div class="stat-value" style="color: #34d399;">${metrics.present_students}</div>
              <div class="stat-label">Inside Hostel (${Math.round((metrics.present_students / metrics.total_students) * 100)}%)</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon info">🏃</div>
            <div>
              <div class="stat-value" style="color: #38bdf8;">${metrics.active_outpasses}</div>
              <div class="stat-label">Active Passes Outside</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon danger">🚨</div>
            <div>
              <div class="stat-value" style="color: #f87171;">${metrics.overdue_outpasses}</div>
              <div class="stat-label">Critical Overdue Returns</div>
            </div>
          </div>
        </div>

        <!-- Escalated / All Outpasses Section -->
        <div class="card" style="margin-bottom: 24px;">
          <div class="card-header">
            <div class="card-title"><span>📑</span> All Hostel Outpasses & Escalated Approvals</div>
            <span class="badge badge-info">${outpasses.length} Total</span>
          </div>
          <div class="table-container">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Pass Code</th>
                  <th>Student & Room</th>
                  <th>Destination</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  <th>Routing & Authority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${outpasses.map(op => `
                  <tr>
                    <td style="font-family: monospace; font-weight: 700; color: #a5b4fc;">${op.outpass_code}</td>
                    <td>
                      <div style="font-weight: 600; color: #fff;">${op.student_name}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${op.student_reg_number} &bull; Room ${op.room_number}</div>
                    </td>
                    <td>
                      <div style="font-weight: 600;">${op.destination}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${op.reason}</div>
                    </td>
                    <td>${ui.formatDate(op.expected_return_time)}</td>
                    <td>${ui.getStatusBadge(op.status)}</td>
                    <td>
                      ${op.is_fallback_routed ? '<span class="badge badge-purple" style="font-size: 0.68rem;">⚡ FALLBACK ROUTED</span>' : '<span style="font-size: 0.78rem; color: var(--text-muted);">Standard</span>'}
                      <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 2px;">Assigned: ${op.assigned_rc_name || 'N/A'}</div>
                    </td>
                    <td>
                      ${op.status === 'PENDING_RC' ? `
                        <div style="display: flex; gap: 4px;">
                          <button class="btn btn-success btn-sm" onclick="window.wardenView.approveEscalated(${op.id}, '${op.outpass_code}', 'APPROVED')">Approve</button>
                          <button class="btn btn-danger btn-sm" onclick="window.wardenView.approveEscalated(${op.id}, '${op.outpass_code}', 'REJECTED')">Reject</button>
                        </div>
                      ` : `
                        <button class="btn btn-secondary btn-sm" onclick="window.wardenView.showAuditModal('${op.outpass_code}', ${JSON.stringify(op.routing_log || '').replace(/"/g, '&quot;')})">
                          Timeline
                        </button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid-2">
          <!-- RC Availability & Fallback Status -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><span>👨‍🏫</span> Residential Caretaker (RC) Availability</div>
            </div>
            <div class="table-container">
              <table class="custom-table">
                <thead>
                  <tr>
                    <th>RC Name</th>
                    <th>Block</th>
                    <th>Status</th>
                    <th>Designated Backup</th>
                  </tr>
                </thead>
                <tbody>
                  ${rcStatuses.map(r => `
                    <tr>
                      <td style="font-weight: 700; color: #fff;">${r.name}</td>
                      <td>${r.block_name}</td>
                      <td>
                        ${r.is_available ? '<span class="badge badge-success">Online</span>' : '<span class="badge badge-warning">Offline (Fallback)</span>'}
                      </td>
                      <td style="color: #a5b4fc; font-weight: 600;">${r.backup_rc_name}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Recent Gate Movement -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><span>🚪</span> Recent Gate Events</div>
            </div>
            <div class="table-container">
              <table class="custom-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Student</th>
                    <th>Destination</th>
                  </tr>
                </thead>
                <tbody>
                  ${gateLogs.map(l => `
                    <tr>
                      <td>${l.timestamp.slice(11, 19)}</td>
                      <td><span class="badge ${l.event_type === 'EXIT' ? 'badge-info' : 'badge-purple'}">${l.event_type}</span></td>
                      <td style="font-weight: 600; color: #fff;">${l.student_name}</td>
                      <td>${l.destination}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger);">Error loading Warden Portal: ${err.message}</p></div>`;
    }
  },

  async approveEscalated(outpassId, code, decision) {
    try {
      const res = await api.rcApproveOutpass(outpassId, decision, `Approved by Chief Warden`);
      sound.playSuccess();
      ui.toast(`Outpass #${res.outpass_code} updated: ${res.status}`, 'success');
      await this.render(document.getElementById('main-view-container'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  },

  async syncOverdue() {
    try {
      const res = await api.triggerOverdueSync();
      sound.playSuccess();
      ui.toast(res.message, 'info');
      await this.render(document.getElementById('main-view-container'));
    } catch (err) {
      ui.toast(err.message, 'danger');
    }
  },

  showAuditModal(code, logText) {
    ui.showModal(
      `🔍 Audit Routing Trace: ${code}`,
      `
        <div style="background: #090d16; padding: 14px; border-radius: var(--radius-md); font-family: monospace; font-size: 0.8rem; line-height: 1.6; white-space: pre-wrap; color: #a5b4fc; border: 1px solid var(--border);">
${logText || 'No routing trace recorded.'}
        </div>
      `,
      `<button class="btn btn-secondary" onclick="ui.closeModal()">Close</button>`
    );
  }
};

window.wardenView = wardenView;
