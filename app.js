import {
  authenticateFaculty,
  authenticateStudent,
  buildSubmission,
  getFinalStatus,
  getSubmissionBadge,
  registerStudent,
  reviewBosaSubmission,
  reviewHoDSubmission,
  validateRegistrationNumber,
} from './logic.js';

const STORAGE_KEY = 'itcerti-od-state-v1';

const defaultState = () => ({
  students: [
    {
      id: 'student-123FA07123',
      regNumber: '123FA07123',
      password: 'student123',
      name: 'Asha Kumar',
      year: 'III',
      semester: 'V',
      role: 'student',
      createdAt: new Date().toISOString(),
    },
  ],
  faculty: [
    {
      id: 'faculty-bosa-1',
      facultyId: 'BOSA001',
      password: 'bosa123',
      name: 'Ravi Menon',
      role: 'BOSA Member',
      department: 'CSE',
      phone: '9876543210',
      gender: 'Male',
      profileImage: 'https://ui-avatars.com/api/?name=Ravi+Menon&background=2563eb&color=fff',
    },
    {
      id: 'faculty-hod-1',
      facultyId: 'HOD001',
      password: 'hod123',
      name: 'Dr. Suresh Iyer',
      role: 'HoD',
      department: 'CSE',
      phone: '9123456780',
      gender: 'Male',
      profileImage: 'https://ui-avatars.com/api/?name=Dr.+Suresh+Iyer&background=0f172a&color=fff',
    },
  ],
  submissions: [],
  notifications: [],
  reviewDrafts: {},
  hodDrafts: {},
  currentUser: null,
  currentRole: null,
  sideNavOpen: false,
});

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const app = document.getElementById('app');
  if (!state.currentUser) {
    app.innerHTML = renderLanding();
    bindLandingEvents();
    return;
  }

  if (state.currentRole === 'student') {
    app.innerHTML = renderStudentView();
    bindStudentEvents();
    return;
  }

  app.innerHTML = renderFacultyView();
  bindFacultyEvents();
}

function renderLanding() {
  return `
    <div class="shell">
      <div class="hero">
        <div>
          <h1>Certificate Collection System</h1>
          <p>Role-based dashboard for student submissions, BOSA review, and HoD sign-off. Students register once, upload accomplishments, and receive outcome notifications.</p>
        </div>
        <div class="auth-card">
          <h2>Student Registration</h2>
          <form id="registrationForm">
            <div class="form-row">
              <label>Registration Number<input name="regNumber" placeholder="123FA07123" required /></label>
              <label>Full Name<input name="name" placeholder="Student Name" required /></label>
            </div>
            <div class="form-row">
              <label>Year of Study<select name="year"><option> I </option><option> II </option><option selected> III </option><option> IV </option></select></label>
              <label>Semester<select name="semester"><option> I </option><option> II </option><option selected> III </option><option> IV </option><option> V </option><option> VI </option><option> VII </option><option> VIII </option></select></label>
            </div>
            <div class="form-row">
              <label>Password<input type="password" name="password" required /></label>
              <label>Confirm Password<input type="password" name="confirmPassword" required /></label>
            </div>
            <button class="primary-btn" type="submit">Register Account</button>
          </form>
        </div>
      </div>

      <div class="grid-2">
        <div class="auth-card">
          <h2>Student Login</h2>
          <form id="studentLoginForm">
            <label>Registration Number<input name="regNumber" placeholder="123FA07123" required /></label>
            <label>Password<input type="password" name="password" required /></label>
            <button class="secondary-btn" type="submit">Login as Student</button>
          </form>
        </div>
        <div class="auth-card">
          <h2>Faculty Login</h2>
          <form id="facultyLoginForm">
            <label>Faculty ID<input name="facultyId" placeholder="BOSA001 or HOD001" required /></label>
            <label>Password<input type="password" name="password" required /></label>
            <button class="secondary-btn" type="submit">Login as Faculty</button>
          </form>
        </div>
      </div>
      <div id="messageBox" class="panel" style="margin-top:16px;padding:16px;"></div>
    </div>
  `;
}

function bindLandingEvents() {
  document.getElementById('registrationForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    if (payload.password !== payload.confirmPassword) {
      showMessage('Passwords do not match.');
      return;
    }

    const result = registerStudent(state, payload);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }

    state.students.push(result.student);
    state.currentUser = result.student;
    state.currentRole = 'student';
    persistState();
    render();
  });

  document.getElementById('studentLoginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const user = authenticateStudent(state, formData.get('regNumber'), formData.get('password'));
    if (!user) {
      showMessage('Invalid student credentials.');
      return;
    }
    state.currentUser = user;
    state.currentRole = 'student';
    persistState();
    render();
  });

  document.getElementById('facultyLoginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const user = authenticateFaculty(state, formData.get('facultyId'), formData.get('password'));
    if (!user) {
      showMessage('Invalid faculty credentials.');
      return;
    }
    state.currentUser = user;
    state.currentRole = user.role === 'HoD' ? 'hod' : 'bosa';
    persistState();
    render();
  });
}

function renderStudentView() {
  const submissions = state.submissions.filter((entry) => entry.studentId === state.currentUser.id);
  const notifications = state.notifications.filter((note) => note.recipientId === state.currentUser.id);
  return `
    <div class="shell">
      <div class="topbar">
        <div>
          <button class="nav-toggle" id="sidebarToggle" aria-label="Toggle navigation">☰</button>
          <span style="margin-left:10px; font-weight:700;">Student Dashboard</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="notice-btn" id="notificationToggle">🔔</button>
          <span class="badge pending">${notifications.length} notifications</span>
          <button class="ghost-btn" id="logoutBtn">Logout</button>
        </div>
      </div>

      <div class="overlay ${state.sideNavOpen ? 'show' : ''}" id="sidebarOverlay"></div>
      <aside class="sidebar ${state.sideNavOpen ? 'open' : ''}">
        <h3>Navigate</h3>
        <a href="#" class="nav-link" data-nav="dashboard">Dashboard</a>
        <a href="#" class="nav-link" data-nav="repo">Certificate Repository</a>
        <a href="#" class="nav-link" data-nav="forms">Submission Forms</a>
      </aside>

      <section class="profile-card" style="margin-bottom:16px;">
        <div class="grid-2">
          <div>
            <h2>${state.currentUser.name}</h2>
            <p class="muted">Reg No: ${state.currentUser.regNumber} • Year ${state.currentUser.year} • Semester ${state.currentUser.semester}</p>
            <div class="meta">
              <span class="tag">Student</span>
              <span class="tag">Certificate Repository</span>
            </div>
          </div>
          <div class="panel" style="padding:16px;">
            <h3>Recent Notifications</h3>
            <ul>
              ${notifications.length ? notifications.slice(0, 3).map((note) => `<li>${note.message}</li>`).join('') : '<li>No notifications yet.</li>'}
            </ul>
          </div>
        </div>
      </section>

      <section class="form-card" id="forms" style="margin-bottom:16px;">
        <h3>Submit New Achievement</h3>
        <div class="form-grid">
          <div class="card" style="padding:16px;">
            <h4>Technical</h4>
            <form class="submission-form" data-form="technical">
              <label>Foundation / Company / Website<input name="eventName" required /></label>
              <label>Domain<input name="domain" required /></label>
              <label>Category<select name="categoryType"><option>Participation</option><option>Appreciation</option><option>Winner</option></select></label>
              <label>From Date<input type="date" name="fromDate" /></label>
              <label>To Date<input type="date" name="toDate" /></label>
              <div class="switch-row">
                <span>OD Request</span>
                <label class="switch"><input type="checkbox" name="odRequested" value="1" class="od-toggle" /><span class="slider"></span></label>
              </div>
              <label class="od-comment hidden">Comment<textarea name="odComment"></textarea></label>
              <label>Upload Certificate<input type="file" name="attachment" /></label>
              <button class="primary-btn" type="submit">Submit Technical</button>
            </form>
          </div>
          <div class="card" style="padding:16px;">
            <h4>Extra-Curricular</h4>
            <form class="submission-form" data-form="extra">
              <label>Field<input name="field" placeholder="Sports / Dramatics / Dance" required /></label>
              <label>From Date<input type="date" name="fromDate" /></label>
              <label>To Date<input type="date" name="toDate" /></label>
              <div class="switch-row">
                <span>OD Request</span>
                <label class="switch"><input type="checkbox" name="odRequested" value="1" class="od-toggle" /><span class="slider"></span></label>
              </div>
              <label class="od-comment hidden">Comment<textarea name="odComment"></textarea></label>
              <label>Upload Certificate<input type="file" name="attachment" /></label>
              <button class="primary-btn" type="submit">Submit Extra-Curricular</button>
            </form>
          </div>
          <div class="card" style="padding:16px;">
            <h4>Co-Curricular</h4>
            <form class="submission-form" data-form="co">
              <label>Domain<input name="domain" placeholder="Minethon / Hackathon / Interview" required /></label>
              <label>Category<select name="categoryType"><option>Participation</option><option>Winner</option><option>Appreciation</option><option>Exam</option><option>Interview</option></select></label>
              <label>From Date<input type="date" name="fromDate" /></label>
              <label>To Date<input type="date" name="toDate" /></label>
              <div class="switch-row">
                <span>OD Request</span>
                <label class="switch"><input type="checkbox" name="odRequested" value="1" class="od-toggle" /><span class="slider"></span></label>
              </div>
              <label class="od-comment hidden">Comment<textarea name="odComment"></textarea></label>
              <label>Upload Proof<input type="file" name="attachment" /></label>
              <button class="primary-btn" type="submit">Submit Co-Curricular</button>
            </form>
          </div>
        </div>
      </section>

      <section class="form-card" style="margin-bottom:16px;">
        <h3>NPTEL / Self-Paced Academic</h3>
        <form class="submission-form" data-form="nptel">
          <label>Subject Name<input name="subjectName" required /></label>
          <label>Type<select name="type"><option>Self-Paced Academic</option><option>Regular Self-Paced</option></select></label>
          <div class="switch-row">
            <span>OD Request</span>
            <label class="switch"><input type="checkbox" name="odRequested" value="1" class="od-toggle" /><span class="slider"></span></label>
          </div>
          <label class="od-comment hidden">Comment<textarea name="odComment"></textarea></label>
          <label>Attachment<input type="file" name="attachment" /></label>
          <button class="primary-btn" type="submit">Submit NPTEL</button>
        </form>
      </section>

      <section class="panel" id="repo" style="padding:16px;">
        <h3>Certificate Repository</h3>
        <div class="grid-3">
          ${submissions.length ? submissions.map((entry) => `
            <div class="queue-card">
              <h4>${entry.category}</h4>
              <p class="small muted">${entry.details.eventName || entry.details.field || entry.details.subjectName || 'Achievement'}</p>
              <p class="small">Attachment: ${entry.attachmentName}</p>
              <p class="small">OD: ${entry.odRequested ? 'Requested' : 'Not requested'}</p>
              <span class="badge ${getSubmissionBadge(entry.status)}">${entry.status}</span>
              ${entry.bosaDecision ? `<p class="small">BOSA: ${entry.bosaDecision.certificateValid ? 'Approved' : 'Rejected'} • OD ${entry.bosaDecision.odGranted ? 'Granted' : 'Denied'}</p>` : ''}
              ${entry.hodDecision ? `<p class="small">HoD: ${entry.hodDecision.approved ? 'Final Approved' : 'Rejected'}</p>` : ''}
              ${entry.status === 'approved' ? `<p class="small"><strong>${getFinalStatus(entry.bosaDecision?.certificateValid !== false, entry.bosaDecision?.odGranted !== false)}</strong></p>` : ''}
            </div>
          `).join('') : '<p>No submissions yet.</p>'}
        </div>
      </section>
    </div>
  `;
}

function bindStudentEvents() {
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    state.sideNavOpen = !state.sideNavOpen;
    persistState();
    render();
  });

  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    state.sideNavOpen = false;
    persistState();
    render();
  });

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      state.sideNavOpen = false;
      persistState();
      render();
    });
  });

  document.getElementById('notificationToggle').addEventListener('click', () => {
    const notes = state.notifications.filter((note) => note.recipientId === state.currentUser.id);
    alert(notes.length ? notes.map((note) => note.message).join('\n') : 'No notifications.');
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    state.currentUser = null;
    state.currentRole = null;
    persistState();
    render();
  });

  document.querySelectorAll('.submission-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      const fileInput = event.currentTarget.querySelector('input[type="file"]');
      payload.attachmentName = fileInput && fileInput.files[0] ? fileInput.files[0].name : 'No attachment';
      payload.odRequested = Boolean(formData.get('odRequested'));
      const submission = buildSubmission(state.currentUser, event.currentTarget.dataset.form, payload);
      state.submissions.unshift(submission);
      persistState();
      render();
    });

    form.querySelectorAll('.od-toggle').forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const commentField = toggle.closest('.switch-row').nextElementSibling;
        if (commentField) {
          commentField.classList.toggle('hidden', !toggle.checked);
        }
      });
    });
  });
}

function renderFacultyView() {
  const pendingBosa = state.submissions.filter((entry) => entry.status === 'pending-bosa');
  const pendingHod = state.submissions.filter((entry) => entry.status === 'pending-hod');
  const faculty = state.currentUser;
  const notifications = state.notifications.filter((note) => note.recipientId === faculty.id);
  return `
    <div class="shell">
      <div class="topbar">
        <div><h2>${faculty.role} Dashboard</h2></div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="notice-btn">🔔</button>
          <span class="badge pending">${notifications.length} alerts</span>
          <button class="ghost-btn" id="logoutBtn">Logout</button>
        </div>
      </div>

      <section class="profile-card" style="margin-bottom:16px;">
        <div class="grid-2">
          <div>
            <h3>${faculty.name}</h3>
            <p class="muted">${faculty.role} • ${faculty.department}</p>
            <p class="muted">Phone: ${faculty.phone} • Gender: ${faculty.gender}</p>
            <div class="meta">
              <span class="tag">Faculty Profile</span>
              <span class="tag">Role-based Review</span>
            </div>
          </div>
          <div class="panel" style="padding:16px;">
            <h4>Notifications</h4>
            <ul>
              ${notifications.length ? notifications.slice(0, 3).map((note) => `<li>${note.message}</li>`).join('') : '<li>No notifications.</li>'}
            </ul>
          </div>
        </div>
      </section>

      <section class="grid-2">
        <div class="panel" style="padding:16px;">
          <h3>BOSA Pending Requests</h3>
          ${pendingBosa.length ? pendingBosa.map((entry) => renderBosaCard(entry)).join('') : '<p>No requests pending at BOSA stage.</p>'}
        </div>
        <div class="panel" style="padding:16px;">
          <h3>HoD Pending Queue</h3>
          ${pendingHod.length ? pendingHod.map((entry) => renderHodCard(entry)).join('') : '<p>No requests forwarded to HoD yet.</p>'}
        </div>
      </section>
    </div>
  `;
}

function bindFacultyEvents() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    state.currentUser = null;
    state.currentRole = null;
    persistState();
    render();
  });

  document.querySelectorAll('[data-bosa-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      const action = button.getAttribute('data-bosa-action');
      const entry = state.submissions.find((item) => item.id === id);
      if (!entry) {
        return;
      }
      const draft = state.reviewDrafts[id] || { certificateValid: true, odGranted: Boolean(entry.odRequested) };
      if (action === 'certificate') {
        draft.certificateValid = button.getAttribute('data-value') === 'true';
      }
      if (action === 'od') {
        draft.odGranted = button.getAttribute('data-value') === 'true';
      }
      state.reviewDrafts[id] = draft;
      persistState();
      render();
    });
  });

  document.querySelectorAll('[data-bosa-submit]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      const entry = state.submissions.find((item) => item.id === id);
      if (!entry) {
        return;
      }
      const draft = state.reviewDrafts[id] || { certificateValid: true, odGranted: Boolean(entry.odRequested) };
      const updated = reviewBosaSubmission(entry, draft);
      if (button.getAttribute('data-bosa-submit') === 'forward') {
        state.submissions = state.submissions.map((item) => (item.id === id ? updated : item));
      } else {
        updated.status = 'rejected';
        state.submissions = state.submissions.map((item) => (item.id === id ? updated : item));
        state.notifications.push({
          id: `note-${Date.now()}`,
          recipientId: entry.studentId,
          message: `Your submission was rejected by BOSA.`,
        });
      }
      persistState();
      render();
    });
  });

  document.querySelectorAll('[data-hod-submit]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      const entry = state.submissions.find((item) => item.id === id);
      if (!entry) {
        return;
      }
      const approved = button.getAttribute('data-hod-submit') === 'approve';
      const updated = reviewHoDSubmission(entry, approved);
      state.submissions = state.submissions.map((item) => (item.id === id ? updated : item));
      state.notifications.push({
        id: `note-${Date.now()}`,
        recipientId: entry.studentId,
        message: approved ? `Your submission was approved with status: ${getFinalStatus(true, entry.bosaDecision?.odGranted !== false)}` : 'Your submission was rejected by HoD.',
      });
      persistState();
      render();
    });
  });
}

function renderBosaCard(entry) {
  const draft = state.reviewDrafts[entry.id] || { certificateValid: true, odGranted: Boolean(entry.odRequested) };
  return `
    <div class="queue-card" style="margin-bottom:12px;">
      <h4>${entry.studentName}</h4>
      <p class="small muted">${entry.regNumber} • ${entry.year} • ${entry.semester}</p>
      <p class="small">Category: ${entry.category}</p>
      <p class="small">Attachment: ${entry.attachmentName}</p>
      <p class="small">OD Requested: ${entry.odRequested ? 'Yes' : 'No'}</p>
      ${entry.odRequested ? `<p class="small">Comment: ${entry.odComment || 'No comment provided.'}</p>` : ''}
      <div class="meta">
        <button class="chip-btn ${draft.certificateValid ? 'active' : ''}" data-bosa-action="certificate" data-id="${entry.id}" data-value="true">Approve Certificate</button>
        <button class="chip-btn ${!draft.certificateValid ? 'active' : ''}" data-bosa-action="certificate" data-id="${entry.id}" data-value="false">Reject Certificate</button>
      </div>
      <div class="meta">
        <button class="chip-btn ${draft.odGranted ? 'active' : ''}" data-bosa-action="od" data-id="${entry.id}" data-value="true" ${entry.odRequested ? '' : 'disabled'}>Grant OD</button>
        <button class="chip-btn ${!draft.odGranted ? 'active' : ''}" data-bosa-action="od" data-id="${entry.id}" data-value="false" ${entry.odRequested ? '' : 'disabled'}>Deny OD</button>
      </div>
      <div class="meta">
        <button class="primary-btn" data-bosa-submit="forward" data-id="${entry.id}">Approve & Forward</button>
        <button class="danger-btn" data-bosa-submit="reject" data-id="${entry.id}">Reject Submission</button>
      </div>
    </div>
  `;
}

function renderHodCard(entry) {
  return `
    <div class="queue-card" style="margin-bottom:12px;">
      <h4>${entry.studentName}</h4>
      <p class="small muted">${entry.regNumber} • ${entry.year} • ${entry.semester}</p>
      <p class="small">Category: ${entry.category}</p>
      <p class="small">BOSA Decision: Certificate ${entry.bosaDecision?.certificateValid ? 'Approved' : 'Rejected'} • OD ${entry.bosaDecision?.odGranted ? 'Granted' : 'Denied'}</p>
      <p class="small">OD Comment: ${entry.odComment || 'No comment provided.'}</p>
      <div class="meta">
        <button class="primary-btn" data-hod-submit="approve" data-id="${entry.id}">Final Approve</button>
        <button class="danger-btn" data-hod-submit="reject" data-id="${entry.id}">Reject</button>
      </div>
    </div>
  `;
}

function showMessage(message) {
  const box = document.getElementById('messageBox');
  if (box) {
    box.innerHTML = `<p>${message}</p>`;
  }
}

window.addEventListener('DOMContentLoaded', render);

window.addEventListener('storage', () => {
  state = loadState();
  render();
});
