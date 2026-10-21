import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const rcView = {
  activeTab: 'attendance',

  async render(container) {
    container.innerHTML = `
      <div class="nav-tabs">
        <button class="nav-tab ${this.activeTab === 'attendance' ? 'active' : ''}" onclick="window.rcView.switchTab('attendance')">
          <span>📊</span> Night Attendance & Exceptions
        </button>
        <button class="nav-tab ${this.activeTab === 'approvals' ? 'active' : ''}" onclick="window.rcView.switchTab('approvals')">
          <span>📑</span> Pending Outpass Approvals
        </button>
        <button class="nav-tab ${this.activeTab === 'rooms' ? 'active' : ''}" onclick="window.rcView.switchTab('rooms')">
          <span>🏢</span> Room-by-Room Grid
        </button>
        <button class="nav-tab ${this.activeTab === 'availability' ? 'active' : ''}" onclick="window.rcView.switchTab('availability')">
          <span>⚙️</span> Duty Schedule & Fallback RC
        </button>
        <button class="nav-tab ${this.activeTab === 'complaints' ? 'active' : ''}" onclick="window.rcView.switchTab('complaints')">
          <span>🔧</span> Block Complaints
        </button>
      </div>

      <div id="rc-tab-content">
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading RC Portal...</div>
      </div>
    `;

    await this.renderCurrentTab();
  },

  async switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.nav-tabs .nav-tab').forEach(t => t.classList.remove('active'));
    event?.currentTarget?.classList.add('active');
    await this.renderCurrentTab();
  },

  async renderCurrentTab() {
    const tabContent = document.getElementById('rc-tab-content');
    if (!tabContent) return;

    try {
      if (this.activeTab === 'attendance') {
        await this.renderAttendanceTab(tabContent);
      } else if (this.activeTab === 'approvals') {
        await this.renderApprovalsTab(tabContent);
      } else if (this.activeTab === 'rooms') {
        await this.renderRoomsTab(tabContent);
      } else if (this.activeTab === 'availability') {
        await this.renderAvailabilityTab(tabContent);
      } else if (this.activeTab === 'complaints') {
        await this.renderComplaintsTab(tabContent);
      }
    } catch (err) {
      tabContent.innerHTML = `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger);">Error loading content: ${err.message}</p></div>`;
    }
  },

  async renderAttendanceTab(container) {
    const summary = await api.getAttendanceSummary(1); // Block A default or assigned

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.3rem; font-weight: 800; color: #fff;">🌙 Exception-Based Night Attendance Matrix</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">No manual roll-call needed. Gate events and active outpasses automatically categorize residents.</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.rcView.syncOverdue()">
          🔄 Run Overdue Sync Check
        </button>
      </div>

      <!-- Stat Cards -->
      <div class="grid-4" style="margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-icon primary">👥</div>
          <div>
            <div class="stat-value">${summary.total_assigned_students}</div>
            <div class="stat-label">Total Assigned Residents</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon success">🏠</div>
          <div>
            <div class="stat-value" style="color: #34d399;">${summary.present_count}</div>
            <div class="stat-label">Present in Hostel</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon info">🏃</div>
          <div>
            <div class="stat-value" style="color: #38bdf8;">${summary.outside_authorized_count}</div>
            <div class="stat-label">Outside (Authorized)</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon danger">⚠️</div>
          <div>
            <div class="stat-value" style="color: #f87171;">${summary.overdue_count + summary.unaccounted_count}</div>
            <div class="stat-label">Action Required (${summary.overdue_count} Overdue)</div>
          </div>
        </div>
      </div>

      <!-- Exception List Section -->
      <div class="card" style="margin-bottom: 24px; border-color: ${summary.exceptions_list.length > 0 ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'};">
        <div class="card-header">
          <div class="card-title" style="color: ${summary.exceptions_list.length > 0 ? '#f87171' : '#fff'};">
            <span>🚨</span> Action-Required Exceptions (${summary.exceptions_list.length})
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            Accounted Rate: <strong style="color: var(--success);">${summary.accounted_rate}%</strong>
          </span>
        </div>

        ${summary.exceptions_list.length === 0 ? `
          <div style="text-align: center; padding: 30px; color: var(--success);">
            <h3>✅ All ${summary.total_assigned_students} residents are 100% accounted for!</h3>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">Zero unapproved absences or overdue returns detected.</p>
          </div>
        ` : `
          <div>
            ${summary.exceptions_list.map(exc => `
              <div class="exception-item">
                <div class="exception-student-meta">
                  <img src="${exc.photo_url}" class="exception-avatar" />
                  <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #fff;">
                      ${exc.name} <span style="font-size: 0.8rem; font-weight: 500; color: #cbd5e1;">(${exc.reg_number})</span>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">
                      Room: <strong>${exc.room}</strong> (Floor ${exc.floor}) &bull; ${exc.block}
                    </div>
                  </div>
                </div>

                <div style="text-align: right;">
                  <div>${ui.getStatusBadge(exc.status)}</div>
                  <div style="font-size: 0.78rem; color: #fca5a5; margin-top: 4px; font-weight: 500;">
                    ${exc.action_reason}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  async renderApprovalsTab(container) {
    const pending = await api.getRCPendingOutpasses();

    container.innerHTML = `
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 800; color: #fff;">📑 Pending Outpass Approvals</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Review student outpasses whose parent digital consent has already been verified.</p>
        </div>
        <span class="badge ${pending.length > 0 ? 'badge-warning' : 'badge-gray'}">${pending.length} Pending</span>
      </div>

      ${pending.length === 0 ? `
        <div class="card" style="text-align: center; padding: 40px; color: var(--text-muted);">
          <span>✅</span> No pending outpass approvals at this time.
        </div>
      ` : `
        <div class="grid-1">
          ${pending.map(op => `
            <div class="card" style="border-left: 4px solid ${op.is_fallback_routed ? '#8b5cf6' : '#6366f1'}; background: linear-gradient(145deg, #1e293b 0%, #172033 100%);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                  <img src="${op.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" style="width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--primary);" />
                  <div>
                    ${op.is_fallback_routed ? `<span class="badge badge-purple" style="margin-bottom: 4px;">⚡ FALLBACK ROUTED FROM UNAVAILABLE RC</span>` : ''}
                    <h3 style="font-size: 1.1rem; font-weight: 800;">${op.student_name} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">(${op.student_reg_number})</span></h3>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                      Room ${op.room_number} &bull; ${op.hostel_name} &bull; Type: <strong>${op.outpass_type}</strong>
                    </div>
                  </div>
                </div>
                <div style="text-align: right; font-size: 0.82rem;">
                  <div><span style="color:var(--text-subtle);">Destination:</span> <strong style="color: #a5b4fc;">${op.destination}</strong></div>
                  <div style="margin-top: 3px;"><span style="color:var(--text-subtle);">Departure:</span> ${ui.formatDate(op.departure_time)}</div>
                  <div style="margin-top: 3px;"><span style="color:var(--text-subtle);">Expected Return:</span> <strong style="color: #38bdf8;">${ui.formatDate(op.expected_return_time)}</strong></div>
                </div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: 8px; font-size: 0.8rem; margin-bottom: 14px;">
                <div style="color: #cbd5e1;"><strong>Reason:</strong> "${op.reason}"</div>
                <div style="color: var(--success); margin-top: 4px; font-size: 0.76rem;">
                  ✔️ Parent Consent Verified (${op.parent_remarks || 'Approved by Parent'})
                </div>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 12px;">
                <button class="btn btn-secondary btn-sm" onclick="window.rcView.showAuditModal('${op.outpass_code}', ${JSON.stringify(op.routing_log || '').replace(/"/g, '&quot;')})">
                  🔍 View Routing Trace
                </button>
                <div style="display: flex; gap: 10px;">
                  <button class="btn btn-danger btn-sm" onclick="window.rcView.confirmAction(${op.id}, '${op.outpass_code}', 'REJECTED')">
                    ❌ Reject Pass
                  </button>
                  <button class="btn btn-success btn-sm" onclick="window.rcView.confirmAction(${op.id}, '${op.outpass_code}', 'APPROVED')">
                    ✔️ Approve & Issue Digital QR
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;
  },

  async renderRoomsTab(container) {
    const rooms = await api.getRoomGrid(1);

    container.innerHTML = `
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 800; color: #fff;">🏢 Room-by-Room Resident Presence</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Floor 1, 2, 3 occupancy and real-time status matrix.</p>
        </div>
      </div>

      <div class="grid-3">
        ${rooms.map(rm => `
          <div class="room-grid-card">
            <div class="room-grid-header">
              <span>🚪 Room ${rm.room_number} (Fl. ${rm.floor_number})</span>
              <span style="color: var(--text-subtle);">${rm.occupancy_count}/${rm.capacity} Beds</span>
            </div>
            <div class="room-students-list">
              ${rm.students.length === 0 ? `<div style="font-size: 0.75rem; color: var(--text-subtle); text-align: center; padding: 8px;">Vacant</div>` : ''}
              ${rm.students.map(std => `
                <div class="room-student-chip">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <img src="${std.photo_url}" style="width: 20px; height: 20px; border-radius: 50%;" />
                    <span style="font-weight: 600;">${std.name.split(' ')[0]}</span>
                  </div>
                  <div>${ui.getStatusBadge(std.status)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  async renderAvailabilityTab(container) {
    const rcList = await api.getRCStatuses();

    container.innerHTML = `
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 800; color: #fff;">⚙️ RC Availability & Intelligent Fallback Configuration</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">When an RC goes offline or on leave, outpass requests automatically reroute without student searching.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div class="card-title"><span>📋</span> All Hostel RC Duty & Fallback Status</div>
        </div>
        <div class="table-container">
          <table class="custom-table">
            <thead>
              <tr>
                <th>RC Name & Email</th>
                <th>Assigned Block</th>
                <th>Current Status</th>
                <th>On Duty</th>
                <th>Designated Backup RC</th>
              </tr>
            </thead>
            <tbody>
              ${rcList.map(r => `
                <tr>
                  <td>
                    <div style="font-weight: 700; color: #fff;">${r.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${r.email}</div>
                  </td>
                  <td>${r.block_name}</td>
                  <td>
                    ${r.is_available ? '<span class="badge badge-success">🟢 ONLINE / AVAILABLE</span>' : '<span class="badge badge-warning">🟠 OFFLINE (FALLBACK ACTIVE)</span>'}
                  </td>
                  <td>${r.on_duty ? '✔️ On Duty' : '❌ Off Duty'}</td>
                  <td>
                    <strong style="color: #a5b4fc;">${r.backup_rc_name}</strong>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Quick Toggle Card for Current RC -->
      <div class="card" style="background: linear-gradient(135deg, #1e1b4b 0%, #1e293b 100%); border-color: rgba(99, 102, 241, 0.4);">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">🔄 Toggle My Availability</h3>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px;">
          Set your status to unavailable when going on leave. All pending and incoming student outpasses will automatically forward to your designated backup RC.
        </p>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-success btn-sm" onclick="window.rcView.toggleAvailability(true)">
            🟢 Set Myself ONLINE (Available)
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.rcView.toggleAvailability(false)">
            🟠 Set Myself OFFLINE (Enable Fallback Routing)
          </button>
        </div>
      </div>
    `;
  },

  async renderComplaintsTab(container) {
    const complaints = await api.getAllComplaints();

    container.innerHTML = `
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 800; color: #fff;">🔧 Block Maintenance Complaints</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Manage and resolve resident complaints with updates sent directly to students.</p>
        </div>
        <span class="badge badge-info">${complaints.length} Total</span>
      </div>

      <div class="card">
        <div class="table-container">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Student & Room</th>
                <th>Category & Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${complaints.map(c => `
                <tr>
                  <td style="font-family: monospace; font-weight: 600; color: #a5b4fc;">${c.complaint_code}</td>
                  <td>
                    <div style="font-weight: 600;">${c.student_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Room ${c.room_number}</div>
                  </td>
                  <td>
                    <div style="font-weight: 600;">${c.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${c.description}</div>
                  </td>
                  <td><span class="badge ${c.priority === 'HIGH' || c.priority === 'EMERGENCY' ? 'badge-danger' : 'badge-warning'}">${c.priority}</span></td>
                  <td>${ui.getStatusBadge(c.status)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="window.rcView.openResolveModal(${c.id}, '${c.complaint_code}', '${c.status}')">
                      Update Status
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  confirmAction(outpassId, code, decision) {
    const isApprove = decision === 'APPROVED';
    ui.showModal(
      `${isApprove ? '✔️ Approve' : '❌ Reject'} Outpass #${code}`,
      `
        <div>
          <p style="margin-bottom: 12px; font-size: 0.9rem;">
            Confirm ${isApprove ? 'approval and cryptographic QR issuance' : 'rejection'} for outpass <strong>#${code}</strong>?
          </p>
          <div class="form-group">
            <label class="form-label">Authority Remarks</label>
            <input type="text" id="rc-remarks" class="form-control" placeholder="${isApprove ? 'Approved by RC on duty' : 'State reason for denial'}" />
          </div>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="ui.closeModal()">Cancel</button>
        <button class="btn ${isApprove ? 'btn-success' : 'btn-danger'}" onclick="window.rcView.submitApproval(${outpassId}, '${decision}')">
          Confirm ${isApprove ? 'Approval' : 'Rejection'}
        </button>
      `
    );
  },

  async submitApproval(outpassId, decision) {
    const remarks = document.getElementById('rc-remarks')?.value.trim() || '';
    try {
      const res = await api.rcApproveOutpass(outpassId, decision, remarks);
      sound.playSuccess();
      ui.closeModal();
      ui.toast(`Outpass #${res.outpass_code} updated: ${res.status}`, 'success');
      await this.renderApprovalsTab(document.getElementById('rc-tab-content'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  },

  async toggleAvailability(isAvailable) {
    try {
      const res = await api.toggleRCAvailability(isAvailable, isAvailable);
      sound.playSuccess();
      ui.toast(res.message, 'success');
      await this.renderAvailabilityTab(document.getElementById('rc-tab-content'));
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
      await this.renderAttendanceTab(document.getElementById('rc-tab-content'));
    } catch (err) {
      ui.toast(err.message, 'danger');
    }
  },

  openResolveModal(complaintId, code, currentStatus) {
    ui.showModal(
      `🛠️ Update Complaint #${code}`,
      `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="cmp-update-status" class="form-control">
            <option value="IN_PROGRESS" ${currentStatus === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
            <option value="RESOLVED" ${currentStatus === 'RESOLVED' ? 'selected' : ''}>Resolved</option>
            <option value="CLOSED" ${currentStatus === 'CLOSED' ? 'selected' : ''}>Closed</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Resolution Notes / Action Taken</label>
          <textarea id="cmp-update-notes" class="form-control" rows="3" placeholder="e.g. Electrician replaced switch board. Issue fixed."></textarea>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="ui.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="window.rcView.submitComplaintUpdate(${complaintId})">Save Update</button>
      `
    );
  },

  async submitComplaintUpdate(complaintId) {
    const status = document.getElementById('cmp-update-status').value;
    const notes = document.getElementById('cmp-update-notes').value.trim();
    try {
      await api.updateComplaint(complaintId, status, notes);
      sound.playSuccess();
      ui.closeModal();
      ui.toast(`Complaint updated to ${status}`, 'success');
      await this.renderComplaintsTab(document.getElementById('rc-tab-content'));
    } catch (err) {
      sound.playError();
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

window.rcView = rcView;
