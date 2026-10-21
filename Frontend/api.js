// REST API Client with JWT Auth & Demo Switcher
const API_BASE = '/api/v1';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('hosteliq_token') || null;
    this.user = JSON.parse(localStorage.getItem('hosteliq_user') || 'null');
  }

  setSession(tokenData) {
    this.token = tokenData.access_token;
    this.user = {
      id: tokenData.user_id,
      name: tokenData.full_name,
      email: tokenData.email,
      role: tokenData.role
    };
    localStorage.setItem('hosteliq_token', this.token);
    localStorage.setItem('hosteliq_user', JSON.stringify(this.user));
  }

  clearSession() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('hosteliq_token');
    localStorage.removeItem('hosteliq_user');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401) {
        // Token expired
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || `HTTP Error ${response.status}`);
      }
      return data;
    } catch (err) {
      throw err;
    }
  }

  // --- Auth APIs ---
  async login(email, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setSession(res);
    return res;
  }

  async demoSwitch(role) {
    const res = await this.request(`/auth/demo-switch/${role}`, {
      method: 'POST'
    });
    this.setSession(res);
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async getStudentProfile() {
    return this.request('/auth/student-profile');
  }

  // --- Outpass APIs ---
  async requestOutpass(payload) {
    return this.request('/outpasses/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getMyOutpasses() {
    return this.request('/outpasses/my-outpasses');
  }

  async getActivePass() {
    return this.request('/outpasses/active-pass');
  }

  async getRCPendingOutpasses() {
    return this.request('/outpasses/rc/pending');
  }

  async rcApproveOutpass(outpass_id, decision, remarks) {
    return this.request('/outpasses/rc/approve', {
      method: 'POST',
      body: JSON.stringify({ outpass_id, decision, remarks })
    });
  }

  async getAllOutpasses() {
    return this.request('/outpasses/all');
  }

  // --- Parent APIs ---
  async getParentStudentStatus() {
    return this.request('/parent/student-status');
  }

  async getParentPendingConsents() {
    return this.request('/parent/pending-consents');
  }

  async submitParentConsent(outpass_id, decision, remarks) {
    return this.request('/parent/consent-action', {
      method: 'POST',
      body: JSON.stringify({ outpass_id, decision, remarks })
    });
  }

  async getParentOutpassHistory() {
    return this.request('/parent/outpass-history');
  }

  // --- Gate APIs ---
  async scanGatePass(qr_payload, gate_id = 'MAIN_GATE_NORTH', scan_type = 'AUTO') {
    return this.request('/gate/scan', {
      method: 'POST',
      body: JSON.stringify({ qr_payload, gate_id, scan_type })
    });
  }

  async getGateLogs(limit = 20) {
    return this.request(`/gate/recent-logs?limit=${limit}`);
  }

  // --- Attendance APIs ---
  async getAttendanceSummary(block_id = null) {
    const q = block_id ? `?block_id=${block_id}` : '';
    return this.request(`/attendance/summary${q}`);
  }

  async getRoomGrid(block_id = null) {
    const q = block_id ? `?block_id=${block_id}` : '';
    return this.request(`/attendance/rooms${q}`);
  }

  async triggerOverdueSync() {
    return this.request('/attendance/trigger-sync', { method: 'POST' });
  }

  // --- Mess APIs ---
  async getMealSchedules() {
    return this.request('/mess/schedules');
  }

  async requestMessToken(schedule_id) {
    return this.request('/mess/request-token', {
      method: 'POST',
      body: JSON.stringify({ schedule_id })
    });
  }

  async redeemMessToken(qr_payload) {
    return this.request('/mess/redeem-token', {
      method: 'POST',
      body: JSON.stringify({ qr_payload })
    });
  }

  async getMessStats() {
    return this.request('/mess/staff-stats');
  }

  // --- Complaints APIs ---
  async submitComplaint(payload) {
    return this.request('/complaints/submit', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getMyComplaints() {
    return this.request('/complaints/my-complaints');
  }

  async getAllComplaints() {
    return this.request('/complaints/all');
  }

  async updateComplaint(id, status, notes = '') {
    return this.request(`/complaints/update/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, resolution_notes: notes })
    });
  }

  // --- Fees APIs ---
  async getMyFees() {
    return this.request('/fees/my-dues');
  }

  async payFee(fee_id) {
    return this.request(`/fees/pay/${fee_id}`, {
      method: 'POST',
      body: JSON.stringify({ payment_method: 'NET_BANKING_MOCK' })
    });
  }

  // --- Notifications APIs ---
  async getNotifications() {
    return this.request('/notifications');
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/mark-all-read', { method: 'POST' });
  }

  // --- Admin APIs ---
  async getSystemMetrics() {
    return this.request('/admin/metrics');
  }

  async getRCStatuses() {
    return this.request('/admin/rc-status');
  }

  async toggleRCAvailability(is_available, on_duty, backup_rc_id = null) {
    return this.request('/admin/rc/toggle-availability', {
      method: 'POST',
      body: JSON.stringify({ is_available, on_duty, backup_rc_id })
    });
  }

  async getAuditLogs(limit = 40) {
    return this.request(`/admin/audit-logs?limit=${limit}`);
  }

  async getHostelStructure() {
    return this.request('/admin/hostels-structure');
  }

  async reseedDatabase() {
    return this.request('/system/reseed', { method: 'POST' });
  }
}

export const api = new ApiClient();
