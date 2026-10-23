import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const adminView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading Admin Portal...</div>
    `;

    try {
      const [metrics, structure, auditLogs] = await Promise.all([
        api.getSystemMetrics(),
        api.getHostelStructure(),
        api.getAuditLogs(40)
      ]);

      container.innerHTML = `
        <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 1.45rem; font-weight: 800; color: #fff;">⚙️ System Administration & Master Audit Center</h1>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Hostel structures, RC duty assignments, system configurations, and immutable audit trails.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-danger btn-sm" onclick="window.adminView.confirmReseed()">
              🔄 Reset / Reseed Demo Ecosystem
            </button>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="grid-4" style="margin-bottom: 24px;">
          <div class="stat-card">
            <div class="stat-icon primary">👥</div>
            <div>
              <div class="stat-value">${metrics.total_students}</div>
              <div class="stat-label">Active Resident Profiles</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon success">🏠</div>
            <div>
              <div class="stat-value" style="color: #34d399;">${metrics.present_students}</div>
              <div class="stat-label">Present In Hostel</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon info">🎫</div>
            <div>
              <div class="stat-value" style="color: #38bdf8;">${metrics.today_tokens_issued}</div>
              <div class="stat-label">Mess Tokens Issued</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon warning">🔧</div>
            <div>
              <div class="stat-value" style="color: #fbbf24;">${metrics.open_complaints}</div>
              <div class="stat-label">Open Maintenance Tickets</div>
            </div>
          </div>
        </div>

        <!-- Hostels & Blocks Hierarchy -->
        <div class="card" style="margin-bottom: 24px;">
          <div class="card-header">
            <div class="card-title"><span>🏢</span> Hostel, Block & Floor Infrastructure Hierarchy</div>
          </div>
          <div class="grid-2">
            ${structure.map(h => `
              <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <div>
                    <h3 style="font-size: 1.1rem; font-weight: 700; color: #fff;">${h.name}</h3>
                    <span style="font-size: 0.76rem; font-family: monospace; color: #a5b4fc;">${h.code} &bull; Gender: ${h.gender}</span>
                  </div>
                  <span class="badge badge-info">${h.blocks.length} Blocks</span>
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${h.blocks.map(b => `
                    <div style="background: var(--bg-card); padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; font-size: 0.82rem;">
                      <span style="font-weight: 600; color: #fff;">🏛️ ${b.name} (${b.floors} Floors)</span>
                      <span style="color: var(--text-muted);">${b.room_count} Rooms &bull; <strong>${b.student_count} Residents</strong></span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Immutable Audit Trail -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><span>🛡️</span> Immutable Security Audit Trail (Recent 40 Events)</div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${auditLogs.length} Events Logged</span>
          </div>
          <div class="table-container">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor & Role</th>
                  <th>Entity</th>
                  <th>State Transition</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${auditLogs.map(log => `
                  <tr>
                    <td style="font-weight: 600; font-size: 0.78rem;">${ui.formatDate(log.timestamp)}</td>
                    <td>
                      <span class="badge badge-purple" style="font-size: 0.7rem;">${log.action}</span>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #fff;">${log.actor_name}</div>
                      <span class="badge badge-gray" style="font-size: 0.65rem;">${log.actor_role}</span>
                    </td>
                    <td><strong style="color: #cbd5e1;">${log.entity_name} #${log.entity_id}</strong></td>
                    <td style="font-size: 0.76rem;">
                      ${log.old_state ? `<span style="color: var(--text-muted);">${log.old_state}</span> ➔ ` : ''}
                      <strong style="color: #38bdf8;">${log.new_state || '—'}</strong>
                    </td>
                    <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 320px;">
                      ${log.details || '—'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger);">Error loading Admin Portal: ${err.message}</p></div>`;
    }
  },

  confirmReseed() {
    ui.showModal(
      '⚠️ Reset / Reseed Demo Ecosystem',
      `
        <div>
          <p style="margin-bottom: 12px; font-size: 0.9rem;">
            This will reset all tables and regenerate fresh realistic demo data for hostels, residents, outpasses, mess schedules, and complaints.
          </p>
          <p style="font-size: 0.82rem; color: var(--warning);">
            Ideal for testing Hackathon Scenarios 1 through 4 from scratch!
          </p>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="ui.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="window.adminView.executeReseed()">Yes, Reset Database</button>
      `
    );
  },

  async executeReseed() {
    try {
      const res = await api.reseedDatabase();
      sound.playSuccess();
      ui.closeModal();
      ui.toast(res.message, 'success');
      await this.render(document.getElementById('main-view-container'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  }
};

window.adminView = adminView;
