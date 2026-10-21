import { api } from '../api.js';
import { ui } from '../ui.js';
import { sound } from '../sound.js';

export const studentView = {
  activeTab: 'outpass',

  async render(container) {
    container.innerHTML = `
      <div class="nav-tabs">
        <button class="nav-tab ${this.activeTab === 'outpass' ? 'active' : ''}" onclick="window.studentView.switchTab('outpass')">
          <span>🎫</span> Digital Outpass & Gate Pass
        </button>
        <button class="nav-tab ${this.activeTab === 'mess' ? 'active' : ''}" onclick="window.studentView.switchTab('mess')">
          <span>🍽️</span> Mess & Non-Veg Tokens
        </button>
        <button class="nav-tab ${this.activeTab === 'complaints' ? 'active' : ''}" onclick="window.studentView.switchTab('complaints')">
          <span>🔧</span> Maintenance Complaints
        </button>
        <button class="nav-tab ${this.activeTab === 'fees' ? 'active' : ''}" onclick="window.studentView.switchTab('fees')">
          <span>💳</span> Hostel & Mess Dues
        </button>
      </div>

      <div id="student-tab-content">
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading Student Portal...</div>
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
    const tabContent = document.getElementById('student-tab-content');
    if (!tabContent) return;

    try {
      if (this.activeTab === 'outpass') {
        await this.renderOutpassTab(tabContent);
      } else if (this.activeTab === 'mess') {
        await this.renderMessTab(tabContent);
      } else if (this.activeTab === 'complaints') {
        await this.renderComplaintsTab(tabContent);
      } else if (this.activeTab === 'fees') {
        await this.renderFeesTab(tabContent);
      }
    } catch (err) {
      tabContent.innerHTML = `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger);">Error loading content: ${err.message}</p></div>`;
    }
  },

  async renderOutpassTab(container) {
    const [profile, activePass, myOutpasses] = await Promise.all([
      api.getStudentProfile(),
      api.getActivePass(),
      api.getMyOutpasses()
    ]);

    let heroPassHtml = '';
    if (activePass && (activePass.status === 'APPROVED' || activePass.status === 'ACTIVE' || activePass.status === 'OVERDUE')) {
      heroPassHtml = `
        <div class="qr-pass-card" style="margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="text-align: left;">
              <span style="font-size: 0.75rem; color: #a5b4fc; text-transform: uppercase; font-weight: 700;">Hostel Digital Outpass Pass</span>
              <h2 style="font-size: 1.25rem; font-weight: 800; color: #fff;">${activePass.outpass_code}</h2>
            </div>
            ${ui.getStatusBadge(activePass.status)}
          </div>
          
          <div class="qr-code-box" id="student-active-qr-canvas"></div>
          
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: var(--radius-md); text-align: left; font-size: 0.82rem;">
            <div>
              <div style="color: var(--text-subtle);">Destination</div>
              <div style="font-weight: 700; color: #fff;">${activePass.destination}</div>
            </div>
            <div>
              <div style="color: var(--text-subtle);">Departure</div>
              <div style="font-weight: 600;">${ui.formatDate(activePass.departure_time)}</div>
            </div>
            <div>
              <div style="color: var(--text-subtle);">Expected Return</div>
              <div style="font-weight: 700; color: ${activePass.status === 'OVERDUE' ? 'var(--danger)' : '#38bdf8'};">${ui.formatDate(activePass.expected_return_time)}</div>
            </div>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 10px;">
            🔒 Cryptographically Signed Pass. Present this QR to the gatekeeper camera on exit & return.
          </p>
        </div>
      `;
    } else if (activePass && (activePass.status === 'PENDING_PARENT' || activePass.status === 'PENDING_RC')) {
      heroPassHtml = `
        <div class="card" style="margin-bottom: 24px; border-left: 4px solid var(--warning);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-size: 0.75rem; color: var(--warning); font-weight: 700;">REQUEST IN PROGRESS</span>
              <h3 style="font-size: 1.1rem; font-weight: 700;">Outpass #${activePass.outpass_code} to ${activePass.destination}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                ${activePass.status === 'PENDING_PARENT' ? '⏳ Awaiting parent digital consent.' : '⏳ Parent consent verified. Awaiting RC approval.'}
              </p>
            </div>
            ${ui.getStatusBadge(activePass.status)}
          </div>
          ${activePass.is_fallback_routed ? `<div style="margin-top: 10px; background: rgba(99, 102, 241, 0.15); padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; color: #a5b4fc;">⚡ <strong>Smart Fallback:</strong> Assigned RC was offline. Auto-routed to Backup RC (${activePass.assigned_rc_name}).</div>` : ''}
        </div>
      `;
    }

    container.innerHTML = `
      <!-- Resident Profile Bar -->
      <div class="card" style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <img src="${profile.photo_url}" style="width: 54px; height: 54px; border-radius: 50%; border: 2px solid var(--primary);" />
          <div>
            <h2 style="font-size: 1.15rem; font-weight: 800;">${profile.full_name} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">(${profile.reg_number})</span></h2>
            <div style="font-size: 0.82rem; color: var(--text-muted); display: flex; gap: 12px; margin-top: 2px;">
              <span>🏢 ${profile.hostel_name} — ${profile.block_name}, Room ${profile.room_number}</span>
              <span>👨‍🏫 RC: ${profile.assigned_rc_name} ${profile.assigned_rc_available ? '<span style="color:var(--success); font-weight:600;">(Online)</span>' : '<span style="color:var(--warning); font-weight:600;">(Offline - Fallback active)</span>'}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; color: var(--text-subtle);">Current Presence</div>
            <div>${profile.is_outside ? '<span class="badge badge-info">🏃 OUTSIDE HOSTEL</span>' : '<span class="badge badge-success">🏠 INSIDE HOSTEL</span>'}</div>
          </div>
          <button class="btn btn-primary" onclick="window.studentView.openOutpassModal()">
            <span>➕</span> Request Outpass
          </button>
        </div>
      </div>

      ${heroPassHtml}

      <!-- Outpass History -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><span>📋</span> Outpass Request History</div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${myOutpasses.length} Total Requests</span>
        </div>
        <div class="table-container">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Destination & Reason</th>
                <th>Departure</th>
                <th>Expected Return</th>
                <th>Parent Consent</th>
                <th>Status</th>
                <th>Audit & Actions</th>
              </tr>
            </thead>
            <tbody>
              ${myOutpasses.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-muted);">No outpass requests found.</td></tr>` : ''}
              ${myOutpasses.map(op => `
                <tr>
                  <td style="font-weight: 700; font-family: monospace; color: #a5b4fc;">${op.outpass_code}</td>
                  <td>
                    <div style="font-weight: 600;">${op.destination}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${op.reason}</div>
                  </td>
                  <td>${ui.formatDate(op.departure_time)}</td>
                  <td>${ui.formatDate(op.expected_return_time)}</td>
                  <td>
                    ${op.parent_consent_status === 'APPROVED' ? '<span style="color:var(--success); font-weight:600;">✔️ Approved</span>' : op.parent_consent_status === 'REJECTED' ? '<span style="color:var(--danger); font-weight:600;">❌ Rejected</span>' : '<span style="color:var(--warning); font-weight:600;">⏳ Pending</span>'}
                  </td>
                  <td>${ui.getStatusBadge(op.status)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="window.studentView.showAuditModal('${op.outpass_code}', ${JSON.stringify(op.routing_log || '').replace(/"/g, '&quot;')})">
                      🔍 Timeline
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Render QR if active
    if (activePass && activePass.qr_payload) {
      ui.renderQRCode('student-active-qr-canvas', activePass.qr_payload, 180);
    }
  },

  async renderMessTab(container) {
    const schedules = await api.getMealSchedules();

    container.innerHTML = `
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.2rem; font-weight: 800; color: #fff;">🍗 Digital Non-Veg & Special Mess Tokens</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Eliminating paper signatures. 1 verified token per meal with atomic capacity reservation.</p>
        </div>
      </div>

      <div class="grid-2">
        ${schedules.map(sch => {
          const isSoldOut = sch.remaining_capacity <= 0;
          return `
            <div class="card" style="border-left: 4px solid ${sch.category === 'NON_VEG' ? '#ef4444' : '#10b981'};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div>
                  <span class="badge ${sch.category === 'NON_VEG' ? 'badge-danger' : 'badge-success'}">${sch.category.replace('_', ' ')}</span>
                  <h3 style="font-size: 1.1rem; font-weight: 700; margin-top: 6px;">${sch.meal_name}</h3>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">
                    📅 ${sch.meal_date} &bull; ⏰ ${sch.meal_time}
                  </div>
                </div>
                ${sch.has_claimed_token ? `<span class="badge badge-purple">TOKEN CLAIMED</span>` : isSoldOut ? `<span class="badge badge-gray">SOLD OUT</span>` : `<span class="badge badge-info">AVAILABLE</span>`}
              </div>

              <!-- Capacity Progress Bar -->
              <div style="margin: 14px 0 18px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 4px;">
                  <span style="color: var(--text-muted);">Remaining Capacity</span>
                  <span style="font-weight: 700; color: ${isSoldOut ? 'var(--danger)' : '#38bdf8'};">${sch.remaining_capacity} / ${sch.total_capacity} Slots</span>
                </div>
                <div style="width: 100%; height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden;">
                  <div style="width: ${((sch.total_capacity - sch.remaining_capacity) / sch.total_capacity) * 100}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8);"></div>
                </div>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                ${sch.has_claimed_token ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.studentView.showTokenQR('${sch.my_token_code}', '${sch.my_qr_payload}', '${sch.meal_name}')">
                    📱 View QR Token
                  </button>
                  <span style="font-size: 0.78rem; font-family: monospace; color: #a5b4fc;">${sch.my_token_code}</span>
                ` : `
                  <button class="btn btn-primary btn-sm" ${isSoldOut ? 'disabled' : ''} onclick="window.studentView.claimToken(${sch.id}, '${sch.meal_name}')">
                    🎟️ Claim Meal Token
                  </button>
                  <span style="font-size: 0.74rem; color: var(--text-subtle);">Anti-duplicate protected</span>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  async claimToken(scheduleId, mealName) {
    try {
      const res = await api.requestMessToken(scheduleId);
      sound.playSuccess();
      ui.toast(`Token for ${mealName} claimed successfully! #${res.token_code}`, 'success');
      await this.renderMessTab(document.getElementById('student-tab-content'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  },

  showTokenQR(tokenCode, qrPayload, mealName) {
    ui.showModal(
      `🎟️ Mess Token: ${mealName}`,
      `
        <div style="text-align: center; padding: 10px 0;">
          <h3 style="font-family: monospace; color: #a5b4fc; margin-bottom: 12px;">${tokenCode}</h3>
          <div class="qr-code-box" id="mess-token-modal-qr"></div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 10px;">
            Present this QR at the mess counter. Staff scanner will redeem and prevent duplicate servings.
          </p>
        </div>
      `,
      `<button class="btn btn-secondary" onclick="ui.closeModal()">Close</button>`
    );
    setTimeout(() => {
      ui.renderQRCode('mess-token-modal-qr', qrPayload, 190);
    }, 50);
  },

  async renderComplaintsTab(container) {
    const complaints = await api.getMyComplaints();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 1.2rem; font-weight: 800; color: #fff;">🛠️ Maintenance & Room Complaints</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Direct escalation to your block Residential Caretaker and technicians.</p>
        </div>
        <button class="btn btn-primary" onclick="window.studentView.openComplaintModal()">
          <span>➕</span> New Complaint
        </button>
      </div>

      <div class="card">
        <div class="table-container">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title & Category</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Reported On</th>
                <th>Resolution Notes</th>
              </tr>
            </thead>
            <tbody>
              ${complaints.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-muted);">No complaints filed.</td></tr>` : ''}
              ${complaints.map(c => `
                <tr>
                  <td style="font-family: monospace; font-weight: 600; color: #a5b4fc;">${c.complaint_code}</td>
                  <td>
                    <div style="font-weight: 600;">${c.title}</div>
                    <span class="badge badge-gray">${c.category}</span>
                  </td>
                  <td>${c.location}</td>
                  <td><span class="badge ${c.priority === 'HIGH' || c.priority === 'EMERGENCY' ? 'badge-danger' : 'badge-warning'}">${c.priority}</span></td>
                  <td>${ui.getStatusBadge(c.status)}</td>
                  <td>${ui.formatDate(c.created_at)}</td>
                  <td style="font-size: 0.8rem; color: var(--text-muted);">${c.resolution_notes || 'Pending inspection'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async renderFeesTab(container) {
    const fees = await api.getMyFees();

    const totalUnpaid = fees.filter(f => f.status === 'UNPAID').reduce((acc, f) => acc + f.amount, 0);

    container.innerHTML = `
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.2rem; font-weight: 800; color: #fff;">💳 Hostel & Mess Fee Invoices</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Verified fee records & transparent status tracking with automated reminders.</p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.75rem; color: var(--text-subtle);">Total Outstanding Dues</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: ${totalUnpaid > 0 ? 'var(--danger)' : 'var(--success)'};">
            ₹ ${totalUnpaid.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-container">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Invoice Type</th>
                <th>Term</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Payment Ref</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${fees.map(f => `
                <tr>
                  <td style="font-weight: 600;">${f.fee_type.replace('_', ' ')}</td>
                  <td>${f.academic_term}</td>
                  <td style="font-weight: 700; color: #fff;">₹ ${f.amount.toLocaleString('en-IN')}</td>
                  <td>${ui.formatDate(f.due_date)}</td>
                  <td>${ui.getStatusBadge(f.status)}</td>
                  <td style="font-family: monospace; font-size: 0.8rem; color: #a5b4fc;">${f.payment_ref || '—'}</td>
                  <td>
                    ${f.status === 'UNPAID' ? `
                      <button class="btn btn-success btn-sm" onclick="window.studentView.payFee(${f.id}, '${f.fee_type}', ${f.amount})">
                        💳 Pay Now (Mock)
                      </button>
                    ` : `<span style="color: var(--success); font-size: 0.82rem; font-weight: 600;">Paid ✔️</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async payFee(feeId, feeType, amount) {
    try {
      const res = await api.payFee(feeId);
      sound.playSuccess();
      ui.toast(`Payment of ₹${amount} for ${feeType} recorded! Ref: ${res.payment_ref}`, 'success');
      await this.renderFeesTab(document.getElementById('student-tab-content'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  },

  openOutpassModal() {
    const now = new Date();
    const defaultDep = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const defaultExp = new Date(now.getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16);

    ui.showModal(
      '🎫 Request Digital Hostel Outpass',
      `
        <form id="outpass-form" onsubmit="window.studentView.submitOutpass(event)">
          <div class="form-group">
            <label class="form-label">Outpass Type</label>
            <select id="op-type" class="form-control">
              <option value="HOME">Home Visit</option>
              <option value="LOCAL">Local City / Shopping</option>
              <option value="EMERGENCY">Medical / Emergency</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Destination Address / City</label>
            <input type="text" id="op-destination" class="form-control" placeholder="e.g. Bangalore City / Parents Home" required />
          </div>
          <div class="form-group">
            <label class="form-label">Detailed Reason</label>
            <textarea id="op-reason" class="form-control" rows="3" placeholder="State clear justification for leave" required></textarea>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Departure Date & Time</label>
              <input type="datetime-local" id="op-departure" class="form-control" value="${defaultDep}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Expected Return Time</label>
              <input type="datetime-local" id="op-return" class="form-control" value="${defaultExp}" required />
            </div>
          </div>
          <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); padding: 10px; border-radius: 8px; font-size: 0.78rem; color: #cbd5e1; margin-top: 10px;">
            ℹ️ Workflow: Digital Parent Consent ➔ Block RC (or automatic Backup RC if RC is offline) ➔ Cryptographic Gate QR Pass.
          </div>
        </form>
      `,
      `
        <button class="btn btn-secondary" onclick="ui.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="document.getElementById('outpass-form').requestSubmit()">Submit Outpass Request</button>
      `
    );
  },

  async submitOutpass(e) {
    e.preventDefault();
    const destination = document.getElementById('op-destination').value.trim();
    const reason = document.getElementById('op-reason').value.trim();
    const outpass_type = document.getElementById('op-type').value;
    const departure_time = document.getElementById('op-departure').value;
    const expected_return_time = document.getElementById('op-return').value;

    try {
      const res = await api.requestOutpass({
        destination,
        reason,
        outpass_type,
        departure_time,
        expected_return_time
      });
      sound.playSuccess();
      ui.closeModal();
      ui.toast(`Outpass requested #${res.outpass_code}. Parent notification sent!`, 'success');
      await this.renderOutpassTab(document.getElementById('student-tab-content'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  },

  openComplaintModal() {
    ui.showModal(
      '🛠️ File Maintenance Complaint',
      `
        <form id="complaint-form" onsubmit="window.studentView.submitComplaint(event)">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="cmp-category" class="form-control">
              <option value="ELECTRICAL">Electrical (Lights, Fans, Sockets)</option>
              <option value="PLUMBING">Plumbing (Taps, Showers, Drainage)</option>
              <option value="INTERNET">Internet / Wi-Fi</option>
              <option value="CLEANLINESS">Cleanliness & Housekeeping</option>
              <option value="CARPENTRY">Carpentry (Doors, Wardrobe, Bed)</option>
              <option value="OTHER">Other Issue</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Issue Title</label>
            <input type="text" id="cmp-title" class="form-control" placeholder="Brief summary of problem" required />
          </div>
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" id="cmp-location" class="form-control" placeholder="e.g. Room 304 / 3rd floor washroom" required />
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select id="cmp-priority" class="form-control">
              <option value="LOW">Low</option>
              <option value="MEDIUM" selected>Medium</option>
              <option value="HIGH">High (Urgent)</option>
              <option value="EMERGENCY">Emergency (Hazard)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Detailed Description</label>
            <textarea id="cmp-desc" class="form-control" rows="3" placeholder="Provide details to assist repair staff" required></textarea>
          </div>
        </form>
      `,
      `
        <button class="btn btn-secondary" onclick="ui.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="document.getElementById('complaint-form').requestSubmit()">Submit Complaint</button>
      `
    );
  },

  async submitComplaint(e) {
    e.preventDefault();
    try {
      const res = await api.submitComplaint({
        category: document.getElementById('cmp-category').value,
        title: document.getElementById('cmp-title').value.trim(),
        location: document.getElementById('cmp-location').value.trim(),
        priority: document.getElementById('cmp-priority').value,
        description: document.getElementById('cmp-desc').value.trim()
      });
      sound.playSuccess();
      ui.closeModal();
      ui.toast(`Complaint filed successfully! #${res.complaint_code}`, 'success');
      await this.renderComplaintsTab(document.getElementById('student-tab-content'));
    } catch (err) {
      sound.playError();
      ui.toast(err.message, 'danger');
    }
  },

  showAuditModal(code, logText) {
    ui.showModal(
      `🔍 Audit Timeline: ${code}`,
      `
        <div style="background: #090d16; padding: 14px; border-radius: var(--radius-md); font-family: monospace; font-size: 0.8rem; line-height: 1.6; white-space: pre-wrap; color: #a5b4fc; border: 1px solid var(--border);">
${logText || 'No timeline events recorded yet.'}
        </div>
      `,
      `<button class="btn btn-secondary" onclick="ui.closeModal()">Close</button>`
    );
  }
};

window.studentView = studentView;
