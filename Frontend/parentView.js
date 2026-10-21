import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const parentView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading Parent Portal...</div>
    `;

    try {
      const [studentStatus, pendingConsents, history] = await Promise.all([
        api.getParentStudentStatus(),
        api.getParentPendingConsents(),
        api.getParentOutpassHistory()
      ]);

      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 1.4rem; font-weight: 800; color: #fff;">👨‍👩‍👦 Parent Consent & Student Monitoring Portal</h1>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Direct digital authorization and instant notifications for your child's hostel movements.</p>
        </div>

        <!-- Linked Student Profile Card -->
        <div class="card" style="margin-bottom: 24px; border-left: 4px solid var(--primary);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <img src="${studentStatus.photo_url}" style="width: 58px; height: 58px; border-radius: 50%; border: 2px solid var(--primary);" />
              <div>
                <span style="font-size: 0.72rem; color: #a5b4fc; text-transform: uppercase; font-weight: 700;">Linked Student</span>
                <h2 style="font-size: 1.25rem; font-weight: 800;">${studentStatus.name} <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted);">(${studentStatus.reg_number})</span></h2>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                  🏢 ${studentStatus.hostel} &bull; ${studentStatus.block}, Room ${studentStatus.room}
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.72rem; color: var(--text-subtle);">Real-Time Presence</div>
              <div style="margin-top: 4px;">
                ${studentStatus.is_outside ? '<span class="badge badge-info" style="font-size: 0.85rem; padding: 6px 12px;">🏃 OUTSIDE HOSTEL</span>' : '<span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 12px;">🏠 INSIDE HOSTEL</span>'}
              </div>
            </div>
          </div>

          ${studentStatus.active_outpass ? `
            <div style="margin-top: 16px; background: rgba(15, 23, 42, 0.6); padding: 12px 16px; border-radius: var(--radius-md); font-size: 0.82rem; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="color: var(--text-subtle);">Active Outpass:</span>
                <strong style="color: #a5b4fc; margin-left: 6px;">#${studentStatus.active_outpass.code}</strong> &bull; ${studentStatus.active_outpass.destination}
              </div>
              <div>
                <span style="color: var(--text-subtle);">Expected Return:</span>
                <strong style="color: ${studentStatus.active_outpass.status === 'OVERDUE' ? 'var(--danger)' : '#38bdf8'}; margin-left: 6px;">${studentStatus.active_outpass.expected_return || 'N/A'}</strong>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Pending Consents Section -->
        <div style="margin-bottom: 30px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <h2 style="font-size: 1.15rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
              <span>🚨</span> Action Required: Outpass Consent Requests
              <span class="badge ${pendingConsents.length > 0 ? 'badge-danger' : 'badge-gray'}">${pendingConsents.length} Pending</span>
            </h2>
          </div>

          ${pendingConsents.length === 0 ? `
            <div class="card" style="text-align: center; padding: 32px; color: var(--text-muted);">
              <span>✅</span> No pending outpass requests requiring your approval.
            </div>
          ` : `
            <div class="grid-1">
              ${pendingConsents.map(op => `
                <div class="card" style="border-left: 4px solid var(--warning); background: linear-gradient(145deg, #1e293b 0%, #1a2234 100%);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
                    <div>
                      <span class="badge badge-warning">Consent Needed</span>
                      <h3 style="font-size: 1.2rem; font-weight: 800; margin-top: 6px;">Outpass #${op.outpass_code}</h3>
                      <div style="font-size: 0.85rem; color: #a5b4fc; font-weight: 600;">Destination: ${op.destination}</div>
                      <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Reason: "${op.reason}"</div>
                    </div>
                    <div style="text-align: right; font-size: 0.82rem;">
                      <div><span style="color:var(--text-subtle);">Departure:</span> <strong>${ui.formatDate(op.departure_time)}</strong></div>
                      <div style="margin-top: 4px;"><span style="color:var(--text-subtle);">Expected Return:</span> <strong style="color:#38bdf8;">${ui.formatDate(op.expected_return_time)}</strong></div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 14px; gap: 12px;">
                    <div style="font-size: 0.76rem; color: var(--text-muted);">
                      🔒 Granting consent will automatically route request to the assigned block RC (or backup RC if offline).
                    </div>
                    <div style="display: flex; gap: 10px;">
                      <button class="btn btn-danger btn-sm" onclick="window.parentView.confirmConsent(${op.id}, '${op.outpass_code}', 'REJECTED')">
                        ❌ Deny Leave
                      </button>
                      <button class="btn btn-success btn-sm" onclick="window.parentView.confirmConsent(${op.id}, '${op.outpass_code}', 'APPROVED')">
                        ✔️ Approve Outpass
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Student Outpass Movement History -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><span>📜</span> Student Outpass & Movement Log</div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${history.length} Record(s)</span>
          </div>
          <div class="table-container">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Pass Code</th>
                  <th>Destination</th>
                  <th>Departure Window</th>
                  <th>Expected Return</th>
                  <th>Actual Exit</th>
                  <th>Actual Return</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${history.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No history records.</td></tr>` : ''}
                ${history.map(op => `
                  <tr>
                    <td style="font-family: monospace; font-weight: 700; color: #a5b4fc;">${op.outpass_code}</td>
                    <td>${op.destination}</td>
                    <td>${ui.formatDate(op.departure_time)}</td>
                    <td>${ui.formatDate(op.expected_return_time)}</td>
                    <td>${op.actual_exit_time ? ui.formatDate(op.actual_exit_time) : '<span style="color:var(--text-subtle);">Not exited</span>'}</td>
                    <td>${op.actual_return_time ? ui.formatDate(op.actual_return_time) : '<span style="color:var(--text-subtle);">Pending return</span>'}</td>
                    <td>${ui.getStatusBadge(op.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger);">Error loading Parent Portal: ${err.message}</p></div>`;
    }
  },

  confirmConsent(outpassId, code, decision) {
    const isApprove = decision === 'APPROVED';
    ui.showModal(
      `${isApprove ? '✔️ Approve' : '❌ Reject'} Outpass #${code}`,
      `
        <div>
          <p style="margin-bottom: 12px; font-size: 0.9rem;">
            Are you sure you want to <strong>${isApprove ? 'APPROVE' : 'REJECT'}</strong> digital outpass <strong>#${code}</strong>?
          </p>
          <div class="form-group">
            <label class="form-label">Parent Remarks (Optional)</label>
            <input type="text" id="parent-remarks" class="form-control" placeholder="${isApprove ? 'e.g. Approved by father for weekend stay' : 'e.g. Denied due to upcoming exams'}" />
          </div>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="ui.closeModal()">Cancel</button>
        <button class="btn ${isApprove ? 'btn-success' : 'btn-danger'}" onclick="window.parentView.submitConsent(${outpassId}, '${decision}')">
          Confirm ${isApprove ? 'Approval' : 'Rejection'}
        </button>
      `
    );
  },

  async submitConsent(outpassId, decision) {
    const remarks = document.getElementById('parent-remarks')?.value.trim() || '';
    try {
      const res = await api.submitParentConsent(outpassId, decision, remarks);
      sound.playSuccess();
      ui.closeModal();
      ui.toast(`Consent submitted for #${res.outpass_code}. Status: ${res.status}`, 'success');
      await this.render(document.getElementById('main-view-container'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  }
};

window.parentView = parentView;
