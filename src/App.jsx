import React, { useEffect, useMemo, useState } from 'react';
import {
  registerStudentStudent as registerStudentStudentApi,
  loginStudent as loginStudentApi,
  loginFaculty as loginFacultyApi,
  fetchNotifications,
  fetchApplicationsForCurrentUser,
  submitApplication,
  bosaProcessApplication,
  hodProcessApplication,
  updateFacultyProfile,
} from './api/mongoApi.js';
import { getToken, setToken, signOut } from './api/session.js';


const noop = () => {};

function mapUserProfile(profile, uid) {
  const role = (profile.role || 'student').toLowerCase();
  return {
    id: uid || profile.uid,
    uid: uid || profile.uid,
    facultyId: profile.facultyId || profile.displayName || '',
    regNumber: profile.regNo || '',
    name: profile.displayName || profile.name || 'User',
    year: profile.year || '',
    semester: profile.semester || '',
    role: role === 'hod' ? 'HoD' : role === 'dean' || role === 'bosa' ? 'BOSA Member' : 'student',
    department: profile.department || '',
    phone: profile.phoneNumber || '',
    gender: profile.gender || '',
    profileImage: profile.profileImageUrl || '',
  };
}

function mapApplicationDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    studentId: data.applicantUid,
    studentName: data.applicantName,
    regNumber: data.regNo,
    category: data.category || data.submissionType,
    details: data,
    attachmentName: data.attachmentUrl || 'Uploaded attachment',
  };
}


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
  currentUser: null,
  currentRole: null,
  sideNavOpen: false,
});

function loadState() {
  return defaultState();
}


function validateRegistrationNumber(value) {
  return /^[A-Za-z0-9]{3}FA\d{2}[A-Za-z0-9]{3}$/i.test(value);
}

function App() {
  const [state, setState] = useState(() => defaultState());
  const [message, setMessage] = useState('');
  const [role, setRole] = useState('student');
  const [mode, setMode] = useState('login');

  const [facultyApplications, setFacultyApplications] = useState([]);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeSection, setActiveSection] = useState('dashboard');

  const [techOd, setTechOd] = useState(false);
  const [extraOd, setExtraOd] = useState(false);
  const [coOd, setCoOd] = useState(false);
  const [nptelOd, setNptelOd] = useState(false);

  const [bosaDecisions, setBosaDecisions] = useState({});
  const [submitState, setSubmitState] = useState({});
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newBosaData, setNewBosaData] = useState({ facultyId: '', name: '', password: '', department: 'IT' });

  useEffect(() => {
    // Restore session and then poll Mongo API every few seconds.
    const token = getToken();
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const user = payload?.profile || {};
      const userRole = payload?.role || 'student';
      const mappedUser = mapUserProfile(user, payload?.uid);

      setState((s) => ({
        ...s,
        currentUser: mappedUser,
        currentRole: userRole === 'bosa' ? 'dean' : userRole,
      }));
    } catch {
      // ignore malformed token
    }
  }, []);

  useEffect(() => {
    if (!state.currentUser) return;

    let alive = true;
    async function refresh() {
      try {
        const notesRes = await fetchNotifications();
        if (!alive) return;
        setNotifications(notesRes?.notifications || []);

        const appsRes = await fetchApplicationsForCurrentUser();
        const apps = appsRes?.applications || [];
        const roleLower = String(state.currentUser.role || '').toLowerCase();

        if (roleLower === 'student') {
          setStudentSubmissions(apps);
        } else if (roleLower === 'dean') {
          setFacultyApplications(apps.filter((a) => a.status === 'pending'));
        } else if (roleLower === 'hod') {
          setFacultyApplications(apps.filter((a) => a.status === 'forwarded'));
        } else {
          // fallback
          setStudentSubmissions(apps);
        }
      } catch {
        // ignore polling errors
      }
    }

    refresh();
    const t = setInterval(refresh, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [state.currentUser]);




  // Offline/local queues derived from local state






  const saveState = (next) => {
    const merged = typeof next === 'function' ? next(state) : next;
    setState(merged);
  };

  const scrollToSection = (id, sectionName) => {
    setActiveSection(sectionName);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setSidebarOpen(false);
  };

  const getBosaDecision = (appId, odRequested) => {
    return bosaDecisions[appId] || {
      certValid: true,
      odGrant: odRequested ? true : false,
      bosaComment: ''
    };
  };

  const setBosaDecisionField = (appId, field, value) => {
    setBosaDecisions(prev => ({
      ...prev,
      [appId]: {
        ...getBosaDecision(appId),
        [field]: value
      }
    }));
  };

  const registerStudent = (event) => {
    event.preventDefault();
    (async () => {
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget));
        if (data.password !== data.confirmPassword) {
          setMessage('Passwords do not match.');
          return;
        }
        const regNumber = data.regNumber.trim().toUpperCase();
        if (!validateRegistrationNumber(regNumber)) {
          setMessage('Registration number must follow the pattern xxxFA07xxx.');
          return;
        }

        await registerStudentStudentApi({
          regNo: regNumber,
          password: data.password,
          name: data.name.trim(),
          year: data.year,
          semester: data.semester,
        });

        setMessage('Registration successful.');
      } catch (err) {
        setMessage(err.message || 'Registration failed');
      }
    })();
  };

  const loginStudent = (event) => {
    event.preventDefault();
    (async () => {
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const reg = data.regNumber.trim().toUpperCase();
        const res = await loginStudentApi({ regNo: reg, password: data.password });
        if (res?.token) {
          setToken(res.token);
          const payload = JSON.parse(atob(res.token.split('.')[1]));
          const profile = payload?.profile || {};
          const userRole = payload?.role || 'student';
          const mappedUser = mapUserProfile(profile, payload?.uid);
          setState((s) => ({
            ...s,
            currentUser: mappedUser,
            currentRole: userRole === 'bosa' ? 'dean' : userRole,
          }));
        }
      } catch (err) {
        setMessage(err.message || 'Invalid student credentials.');
      }
    })();
  };

  const loginFaculty = (event) => {
    event.preventDefault();
    (async () => {
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const facultyId = String(data.facultyId || '').trim();
        const res = await loginFacultyApi({ facultyId, password: data.password });
        if (res?.token) {
          setToken(res.token);
          const payload = JSON.parse(atob(res.token.split('.')[1]));
          const profile = payload?.profile || {};
          const userRole = payload?.role || 'student';
          const mappedUser = mapUserProfile(profile, payload?.uid);
          setState((s) => ({
            ...s,
            currentUser: mappedUser,
            currentRole: userRole === 'bosa' ? 'dean' : userRole,
          }));
        }
      } catch (err) {
        setMessage(err.message || 'Invalid faculty credentials');
      }
    })();
  };

  const logout = () => {
    signOut();
    setState((s) => ({ ...defaultState(), currentUser: null, currentRole: null }));
    setNotifications([]);
    setStudentSubmissions([]);
    setFacultyApplications([]);
  };




  const submitForm = (event, formType) => {
    event.preventDefault();
    setSubmitState(prev => ({ ...prev, [formType]: 'loading' }));
    const currentTarget = event.currentTarget;
    (async () => {
      try {
        const data = Object.fromEntries(new FormData(currentTarget));
        const file = currentTarget.attachment?.files?.[0] || null;
        
        let fileDataUrl = null;
        let fileName = '';
        if (file) {
          fileName = file.name;
          fileDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
          });
        }

        const details = { ...data };
        delete details.attachment;
        await submitApplication({
          applicantUid: state.currentUser.uid || state.currentUser.id,
          applicantName: state.currentUser.name,
          regNo: state.currentUser.regNumber,
          submissionType: formType,
          category: data.categoryType || formType,
          details: {
            ...details,
            odRequested: Boolean(data.odRequested),
            odComment: data.odComment || '',
          },
          attachmentUrl: fileDataUrl,
          attachmentName: fileName || 'Uploaded attachment',
        });
        setSubmitState(prev => ({ ...prev, [formType]: 'success' }));
        currentTarget.reset();
        setTimeout(() => {
          setSubmitState(prev => ({ ...prev, [formType]: null }));
        }, 3500);
      } catch (err) {
        setSubmitState(prev => ({ ...prev, [formType]: null }));
        setMessage(err.message || 'Submission failed');
      }
    })();
  };

  const pendingBosa = facultyApplications.filter((s) => s.status === 'pending');
  const pendingHod = facultyApplications.filter((s) => s.status === 'forwarded');



  const [sidebarOpen, setSidebarOpen] = useState(false);

  const studentViews = useMemo(() => studentSubmissions, [studentSubmissions]);

  if (!state.currentUser) {
    return (
      <div className="relative w-full min-h-screen overflow-y-auto bg-gradient-to-br from-purple-800 via-purple-700 to-pink-400">
        {/* Animated Stars Background */}
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="stars"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 60}%`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: Math.random() * 0.7 + 0.3,
            }}
          />
        ))}

        {/* Mountain Silhouette */}
        <div className="mountain-bg" />

        {/* Header with Logo and IT */}
        <div className="relative z-20 flex flex-col gap-4 px-8 py-6 md:flex-row md:items-center md:justify-between">
          {/* Vignan Logo - Top Left */}
          <div className="text-white text-xl font-bold flex items-center gap-2">
            <div className="text-3xl">🛡️</div>
            <div>
              <div className="text-sm font-bold">VIGNAN'S</div>
              <div className="text-xs text-white/80">Foundation for Science, Technology & Research</div>
            </div>
          </div>

          {/* Information Technology - Top Center */}
          <div className="hidden md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 text-center">
            <div className="text-3xl font-bold text-blue-300" style={{textShadow: '0 0 20px rgba(59, 130, 246, 0.8)'}}>Information Technology</div>
            <div className="text-white/80 text-sm">Certificate Collection System</div>
          </div>

          {/* Spacer for alignment */}
          <div className="w-32 hidden md:block"></div>
        </div>

        {/* Auth Card Container */}
        <div className="relative z-10 flex flex-col items-center justify-center px-4 py-20 min-h-[calc(100vh-120px)]">
          <div className="auth-card max-w-md w-full">
            <div className="md:hidden text-center mb-6 rounded-3xl border border-white/20 bg-white/10 px-6 py-6 shadow-2xl backdrop-blur-xl">
              <div className="text-2xl font-bold text-blue-300" style={{textShadow: '0 0 20px rgba(59, 130, 246, 0.8)'}}>Information Technology</div>
              <div className="mt-2 text-white/80 text-sm">Certificate Collection System</div>
            </div>
            <div>
              <h1 className="auth-title">{mode === 'login' ? 'Login' : 'Register'}</h1>
              <p className="auth-subtitle">
                {mode === 'login'
                  ? 'Welcome back to Certificate System'
                  : 'Create your student account'}
              </p>
            </div>

            {/* Role Selector */}
            <div className="mt-6">
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/70">Select Role</label>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setMode('login');
                  setMessage('');
                }}
                className="role-selector mt-2"
              >
                <option value="student" className="bg-purple-900">👤 Student</option>
                <option value="dean" className="bg-purple-900">📋 BOSA Member</option>
                <option value="hod" className="bg-purple-900">🎓 HoD</option>
              </select>
            </div>

            {/* Student Login Form */}
            {role === 'student' && mode === 'login' && (
              <form onSubmit={loginStudent} className="mt-8 space-y-4">
                <div className="auth-input-group">
                  <input
                    type="text"
                    name="regNumber"
                    placeholder="Registration Number"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">👤</span>
                </div>
                <div className="auth-input-group">
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">🔒</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-4">
                  <label className="flex items-center text-white/80 gap-3">
                    <input type="checkbox" className="mr-0" />
                    <span>Remember me</span>
                  </label>
                  <a href="#" className="text-white/80 hover:text-white">Forgot password?</a>
                </div>
                <button className="auth-button" type="submit">Login</button>
                <p className="auth-footer">Don't have an account? <button type="button" className="text-white font-semibold hover:underline" onClick={() => { setMode('register'); setMessage(''); }}>Register</button></p>
              </form>
            )}

            {/* Student Register Form */}
            {role === 'student' && mode === 'register' && (
              <form onSubmit={registerStudent} className="mt-8 space-y-4">
                <div className="auth-input-group">
                  <input
                    name="regNumber"
                    placeholder="Registration Number"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">🆔</span>
                </div>
                <div className="auth-input-group">
                  <input
                    name="name"
                    placeholder="Full Name"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">👤</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="auth-input-group">
                    <select name="year" className="text-white/60">
                      <option value="I" className="bg-purple-900">Year I</option>
                      <option value="II" className="bg-purple-900">Year II</option>
                      <option value="III" className="bg-purple-900">Year III</option>
                      <option value="IV" className="bg-purple-900">Year IV</option>
                    </select>
                  </div>
                  <div className="auth-input-group">
                    <select name="semester" className="text-white/60">
                      <option value="I" className="bg-purple-900">Sem I</option>
                      <option value="II" className="bg-purple-900">Sem II</option>
                      <option value="III" className="bg-purple-900">Sem III</option>
                      <option value="IV" className="bg-purple-900">Sem IV</option>
                      <option value="V" className="bg-purple-900">Sem V</option>
                      <option value="VI" className="bg-purple-900">Sem VI</option>
                      <option value="VII" className="bg-purple-900">Sem VII</option>
                      <option value="VIII" className="bg-purple-900">Sem VIII</option>
                    </select>
                  </div>
                </div>
                <div className="auth-input-group">
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">🔒</span>
                </div>
                <div className="auth-input-group">
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">✓</span>
                </div>
                <button className="auth-button" type="submit">Create Account</button>
                <p className="auth-footer">Already have an account? <button type="button" className="text-white font-semibold hover:underline" onClick={() => { setMode('login'); setMessage(''); }}>Login</button></p>
              </form>
            )}

            {/* Dean Login Form */}
            {role === 'dean' && (
              <form onSubmit={loginFaculty} className="mt-8 space-y-4">
                <div className="auth-input-group">
                  <input
                    name="facultyId"
                    placeholder="BOSA Member ID"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">📋</span>
                </div>
                <div className="auth-input-group">
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">🔒</span>
                </div>
                <div className="flex items-center text-sm mt-4">
                  <label className="flex items-center text-white/80 gap-3">
                    <input type="checkbox" className="mr-0" />
                    <span>Remember me</span>
                  </label>
                </div>
                <button className="auth-button" type="submit">Login as BOSA Member</button>
              </form>
            )}

            {/* HoD Login Form */}
            {role === 'hod' && (
              <form onSubmit={loginFaculty} className="mt-8 space-y-4">
                <div className="auth-input-group">
                  <input
                    name="facultyId"
                    placeholder="HoD ID"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">🎓</span>
                </div>
                <div className="auth-input-group">
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    required
                    className="pr-12"
                  />
                  <span className="auth-input-icon">🔒</span>
                </div>
                <div className="flex items-center text-sm mt-4">
                  <label className="flex items-center text-white/80 gap-3">
                    <input type="checkbox" className="mr-0" />
                    <span>Remember me</span>
                  </label>
                </div>
                <button className="auth-button" type="submit">Login as HoD</button>
              </form>
            )}

            {/* Error Message */}
            {message && (
              <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur">
                {message}
              </div>
            )}
        </div>
      </div>
      </div>
    );
  }

  if (state.currentRole === 'student') {
    return (
      <div className="shell">
        <div className="topbar">
          <div className="flex items-center gap-4">
            <button className="nav-toggle" onClick={() => setSidebarOpen((open) => !open)}>☰</button>
            <div className="text-white text-lg font-bold flex items-center gap-3">
              <div className="text-2xl">🛡️</div>
              <div>
                <div className="text-xs font-bold">VIGNAN'S</div>
                <div className="text-xs text-white/70">FSTR</div>
              </div>
            </div>
            <div className="mx-auto text-center flex-1">
              <div className="text-2xl font-bold text-blue-300" style={{textShadow: '0 0 10px rgba(59, 130, 246, 0.6)'}}>IT</div>
            </div>
            <span style={{ marginLeft: 10, fontWeight: 700 }}>Student Dashboard</span>
          </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="notice-btn">🔔</button>
            <span className="badge pending">{notifications.length} notifications</span>
            <button className="ghost-btn" onClick={logout}>Logout</button>
          </div>
        </div>
        <div className={`overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <h3>Navigate</h3>
          <a href="#" className={`nav-link ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={(event) => { event.preventDefault(); scrollToSection('student-dashboard', 'dashboard'); }}>Dashboard</a>
          <a href="#" className={`nav-link ${activeSection === 'repository' ? 'active' : ''}`} onClick={(event) => { event.preventDefault(); scrollToSection('student-repository', 'repository'); }}>Certificate Repository</a>
          <a href="#" className={`nav-link ${activeSection === 'forms' ? 'active' : ''}`} onClick={(event) => { event.preventDefault(); scrollToSection('student-forms', 'forms'); }}>Submission Forms</a>
        </aside>
        
        <section id="student-dashboard" className="profile-card" style={{ marginBottom: 28 }}>
          <div className="grid-2">
            <div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <img 
                  src={state.currentUser.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(state.currentUser.name)}`}
                  alt="Profile" 
                  style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(state.currentUser.name)}` }}
                />
                <div>
                  <h2>Welcome back, {state.currentUser.name}!</h2>
                  <p className="muted">Reg No: {state.currentUser.regNumber} • Year {state.currentUser.year} • Semester {state.currentUser.semester}</p>
                  <div className="meta">
                    <span className="tag">Student</span>
                    <span className="tag">IT Department</span>
                  </div>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 24 }}>Students cannot self-update profiles; admin-managed account data is used.</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <h3>Recent Notifications</h3>
              <ul style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {notifications.length ? notifications.slice(0, 5).map((note) => (
                  <li key={note.id} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', listStyle: 'none' }}>
                    {note.message}
                  </li>
                )) : <li style={{ listStyle: 'none' }} className="muted">No notifications yet.</li>}
              </ul>
            </div>
          </div>
        </section>

        <section id="student-forms" className="form-card" style={{ marginBottom: 28 }}>
          <h3>Submit New Achievement</h3>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="card card-gradient-blue" style={{ padding: 16 }}>
              <h4>Technical</h4>
              <form onSubmit={(event) => submitForm(event, 'technical')}>
                <label>Foundation / Company / Website<input name="eventName" required /></label>
                <label>Domain<input name="domain" required /></label>
                <label>Category<select name="categoryType"><option>Participation</option><option>Appreciation</option><option>Winner</option></select></label>
                <label>From Date<input type="date" name="fromDate" required /></label>
                <label>To Date<input type="date" name="toDate" required /></label>
                <div className="switch-row"><span>OD Request</span><label className="switch"><input type="checkbox" name="odRequested" value="1" checked={techOd} onChange={(e) => setTechOd(e.target.checked)} /><span className="slider" /></label></div>
                {techOd && <label>Comment<textarea name="odComment" placeholder="Provide OD reason..." /></label>}
                <label>Certificate Attachment<input type="file" name="attachment" accept="image/*,.pdf" required /></label>
                <button className={`primary-btn ${submitState['technical'] === 'success' ? 'btn-success' : ''}`} type="submit" disabled={submitState['technical'] === 'loading'}>
                  {submitState['technical'] === 'success' ? 'Submitted! ✓' : submitState['technical'] === 'loading' ? 'Submitting...' : 'Submit Technical'}
                </button>
              </form>
            </div>
            <div className="card card-gradient-purple" style={{ padding: 16 }}>
              <h4>Extra-Curricular</h4>
              <form onSubmit={(event) => submitForm(event, 'extra')}>
                <label>Field<input name="field" placeholder="Sports / Dramatics / Dance" required /></label>
                <label>From Date<input type="date" name="fromDate" required /></label>
                <label>To Date<input type="date" name="toDate" required /></label>
                <div className="switch-row"><span>OD Request</span><label className="switch"><input type="checkbox" name="odRequested" value="1" checked={extraOd} onChange={(e) => setExtraOd(e.target.checked)} /><span className="slider" /></label></div>
                {extraOd && <label>Comment<textarea name="odComment" placeholder="Provide OD reason..." /></label>}
                <label>Certificate Attachment<input type="file" name="attachment" accept="image/*,.pdf" required /></label>
                <button className={`primary-btn ${submitState['extra'] === 'success' ? 'btn-success' : ''}`} type="submit" disabled={submitState['extra'] === 'loading'}>
                  {submitState['extra'] === 'success' ? 'Submitted! ✓' : submitState['extra'] === 'loading' ? 'Submitting...' : 'Submit Extra-Curricular'}
                </button>
              </form>
            </div>
            <div className="card card-gradient-pink" style={{ padding: 16 }}>
              <h4>Co-Curricular</h4>
              <form onSubmit={(event) => submitForm(event, 'co')}>
                <label>Domain<input name="domain" placeholder="Minethon / Hackathon / Interview" required /></label>
                <label>Category<select name="categoryType"><option>Participation</option><option>Winner</option><option>Appreciation</option><option>Exam</option><option>Interview</option></select></label>
                <label>From Date<input type="date" name="fromDate" required /></label>
                <label>To Date<input type="date" name="toDate" required /></label>
                <div className="switch-row"><span>OD Request</span><label className="switch"><input type="checkbox" name="odRequested" value="1" checked={coOd} onChange={(e) => setCoOd(e.target.checked)} /><span className="slider" /></label></div>
                {coOd && <label>Comment<textarea name="odComment" placeholder="Provide OD reason..." /></label>}
                <label>Certificate Attachment<input type="file" name="attachment" accept="image/*,.pdf" required /></label>
                <button className={`primary-btn ${submitState['co'] === 'success' ? 'btn-success' : ''}`} type="submit" disabled={submitState['co'] === 'loading'}>
                  {submitState['co'] === 'success' ? 'Submitted! ✓' : submitState['co'] === 'loading' ? 'Submitting...' : 'Submit Co-Curricular'}
                </button>
              </form>
            </div>
          </div>
        </section>
        
        <section className="form-card card-gradient-teal" style={{ marginBottom: 28 }}>
          <h3>NPTEL / Self-Paced Academic</h3>
          <form onSubmit={(event) => submitForm(event, 'nptel')} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <label>Subject Name<input name="subjectName" required /></label>
            <label>Type<select name="type"><option>Self-Paced Academic</option><option>Regular Self-Paced</option></select></label>
            <label>From Date<input type="date" name="fromDate" required /></label>
            <label>To Date<input type="date" name="toDate" required /></label>
            <div className="switch-row"><span>OD Request</span><label className="switch"><input type="checkbox" name="odRequested" value="1" checked={nptelOd} onChange={(e) => setNptelOd(e.target.checked)} /><span className="slider" /></label></div>
            {nptelOd && <label>Comment<textarea name="odComment" placeholder="Provide OD reason..." /></label>}
            <label>Certificate Attachment<input type="file" name="attachment" accept="image/*,.pdf" required /></label>
            <button className={`primary-btn ${submitState['nptel'] === 'success' ? 'btn-success' : ''}`} type="submit" disabled={submitState['nptel'] === 'loading'}>
              {submitState['nptel'] === 'success' ? 'Submitted! ✓' : submitState['nptel'] === 'loading' ? 'Submitting...' : 'Submit NPTEL'}
            </button>
          </form>
        </section>

        <section id="student-repository" className="panel" style={{ padding: 16, marginBottom: 28 }}>
          <h3>Certificate Repository</h3>
          <div className="grid-3" style={{ marginTop: 20 }}>
            {studentViews.length ? studentViews.map((entry) => (
              <div className="queue-card" key={entry.id}>
                <h4>{entry.category.toUpperCase()}</h4>
                <p className="small muted" style={{ margin: '8px 0' }}>{entry.details.eventName || entry.details.field || entry.details.subjectName || 'Achievement'}</p>
                <p className="small">
                  Attachment:{' '}
                  {entry.attachmentUrl ? (
                    <a href={entry.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      {entry.attachmentName || 'View Document'}
                    </a>
                  ) : (
                    entry.attachmentName || 'No attachment'
                  )}
                </p>
                <p className="small" style={{ marginBottom: 16 }}>OD: {entry.odRequested ? 'Requested' : 'Not requested'}</p>
                <span className={`badge ${entry.status}`}>{entry.status}</span>
              </div>
            )) : <p className="muted">No submissions yet.</p>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="flex items-center gap-4">
          <button className="nav-toggle" onClick={() => setSidebarOpen((open) => !open)} style={{ fontSize: '1.5rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>☰</button>
          <div className="text-white text-lg font-bold flex items-center gap-3">
            <div className="text-2xl">🛡️</div>
            <div>
              <div className="text-xs font-bold">VIGNAN'S</div>
              <div className="text-xs text-white/70">FSTR</div>
            </div>
          </div>
          <div className="mx-auto text-center flex-1">
            <div className="text-2xl font-bold text-blue-300" style={{textShadow: '0 0 10px rgba(59, 130, 246, 0.6)'}}>
              {state.currentUser.role === 'dean' ? 'BOSA Dashboard' : 'HoD Dashboard'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img 
            src={state.currentUser.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(state.currentUser.name)}`}
            alt="Profile" 
            title="Edit Profile & Settings"
            onClick={() => setShowSettingsModal(true)}
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseOver={(e) => e.target.style.transform = 'scale(1.1)'}
            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(state.currentUser.name)}` }}
          />
          <button className="notice-btn" title="Notifications">🔔 {notifications.length}</button>
          <button className="ghost-btn" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className={`overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{ backgroundColor: '#4B0082', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff' }}>Menu</h3>
        <a href="#" className="nav-link active" onClick={(e) => e.preventDefault()}>Dashboard</a>
        <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); setShowSettingsModal(true); setSidebarOpen(false); }}>Profile & Settings</a>
        <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '16px 0' }} />
        <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); logout(); }}>Logout</a>
      </aside>

      <div style={{ padding: '24px 32px' }}>

      {showSettingsModal && (
        <div className="modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-2xl font-bold">Profile & Settings</h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = Object.fromEntries(new FormData(e.currentTarget));
              const file = e.currentTarget.profileImage?.files?.[0];
              try {
                if (file && file.size > 800 * 1024) throw new Error('Profile image exceeds 800KB limit.');
                let fileDataUrl = undefined;
                if (file) {
                  fileDataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(file);
                  });
                }
                const res = await updateFacultyProfile({ 
                  uid: state.currentUser.id, 
                  displayName: formData.displayName || state.currentUser.name, 
                  phoneNumber: formData.phone || state.currentUser.phone, 
                  gender: formData.gender || state.currentUser.gender, 
                  profileImageUrl: fileDataUrl 
                });
                if (res?.token) setToken(res.token);
                setMessage('Profile updated.');
                setShowSettingsModal(false);
              } catch (err) {
                setMessage(err.message || 'Profile update failed');
              }
            }}>
              <label>Name<input name="displayName" defaultValue={state.currentUser.name} /></label>
              <label>Phone<input name="phone" defaultValue={state.currentUser.phone} /></label>
              <label>Gender<select name="gender" defaultValue={state.currentUser.gender}><option>Male</option><option>Female</option><option>Other</option></select></label>
              <label>Profile Image<input type="file" name="profileImage" accept="image/*" /></label>
              <button className="primary-btn mt-4 w-full" type="submit">Update Profile</button>
            </form>

            <hr className="my-6 border-white/10" />

            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = Object.fromEntries(new FormData(e.currentTarget));
              try {
                const { changeFacultyPassword } = await import('./api/mongoApi.js');
                await changeFacultyPassword({ currentPassword: formData.currentPassword, newPassword: formData.newPassword });
                setMessage('Password updated successfully.');
                e.currentTarget.reset();
              } catch (err) {
                setMessage(err.message || 'Password update failed');
              }
            }}>
              <h4 className="mb-2">Change Password</h4>
              <label>Current Password<input name="currentPassword" type="password" required /></label>
              <label>New Password<input name="newPassword" type="password" required /></label>
              <button className="primary-btn mt-4 w-full" type="submit">Update Password</button>
            </form>
          </div>
        </div>
      )}

      {state.currentRole === 'dean' && (
        <>
          <div className="grid-3 mb-8">
            <div className="card card-gradient-blue p-6">
              <h3 className="text-2xl font-bold">{pendingBosa.length}</h3>
              <p className="muted">Pending Approvals</p>
            </div>
            <div className="card card-gradient-purple p-6">
              <h3 className="text-2xl font-bold">{facultyApplications.length - pendingBosa.length}</h3>
              <p className="muted">Processed Applications</p>
            </div>
            <div className="card card-gradient-pink p-6">
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const { registerBosaMember } = await import('./api/mongoApi.js');
                  await registerBosaMember(newBosaData);
                  setMessage('BOSA Member added successfully.');
                  setNewBosaData({ facultyId: '', name: '', password: '', department: 'IT' });
                } catch (err) {
                  setMessage(err.message || 'Failed to add BOSA Member');
                }
              }}>
                <h4 className="mb-2 font-bold">Add BOSA Member</h4>
                <div className="flex gap-2">
                  <input placeholder="Faculty ID" value={newBosaData.facultyId} onChange={e => setNewBosaData(p => ({...p, facultyId: e.target.value}))} required />
                  <input placeholder="Name" value={newBosaData.name} onChange={e => setNewBosaData(p => ({...p, name: e.target.value}))} required />
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="password" placeholder="Password" value={newBosaData.password} onChange={e => setNewBosaData(p => ({...p, password: e.target.value}))} required />
                  <button className="primary-btn" type="submit">Add</button>
                </div>
              </form>
            </div>
          </div>

          <section className="panel" style={{ padding: 16 }}>
            <h3>BOSA Member Pending Requests</h3>
            {pendingBosa.length ? pendingBosa.map((entry) => {
              const dec = getBosaDecision(entry.id, entry.odRequested);
              return (
                <div className="queue-card card-gradient-blue" key={entry.id} style={{ marginBottom: 12 }}>
                  <h4>{entry.studentName}</h4>
                  <p className="small muted">{entry.regNumber} • {entry.year} • {entry.semester}</p>
                  <p className="small">Category: {entry.category.toUpperCase()}</p>
                  <p className="small">OD Requested: {entry.odRequested ? 'Yes' : 'No'}</p>
                  {entry.odRequested ? <p className="small">Comment: {entry.odComment || 'No comment provided.'}</p> : null}
                  <p className="small">
                    Attachment:{' '}
                    {entry.attachmentUrl ? (
                      <a href={entry.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        {entry.attachmentName || 'View Document'}
                      </a>
                    ) : (
                      entry.attachmentName || 'No attachment'
                    )}
                  </p>
                  
                  {/* BOSA Decision Panel */}
                  <div style={{ display: 'grid', gap: 12, margin: '16px 0', padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="small font-semibold">Certificate Validity:</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          type="button"
                          className="ghost-btn small" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: dec.certValid ? 'rgba(52, 211, 153, 0.15)' : '', borderColor: dec.certValid ? '#34d399' : '', color: dec.certValid ? '#34d399' : '' }}
                          onClick={() => setBosaDecisionField(entry.id, 'certValid', true)}
                        >
                          Approve
                        </button>
                        <button 
                          type="button"
                          className="ghost-btn small" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: !dec.certValid ? 'rgba(239, 68, 68, 0.15)' : '', borderColor: !dec.certValid ? '#f87171' : '', color: !dec.certValid ? '#f87171' : '' }}
                          onClick={() => setBosaDecisionField(entry.id, 'certValid', false)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {entry.odRequested && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="small font-semibold">On-Duty (OD) Status:</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button 
                            type="button"
                            className="ghost-btn small" 
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: dec.odGrant ? 'rgba(59, 130, 246, 0.15)' : '', borderColor: dec.odGrant ? '#3b82f6' : '', color: dec.odGrant ? '#3b82f6' : '' }}
                            onClick={() => setBosaDecisionField(entry.id, 'odGrant', true)}
                          >
                            Grant OD
                          </button>
                          <button 
                            type="button"
                            className="ghost-btn small" 
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: !dec.odGrant ? 'rgba(239, 68, 68, 0.15)' : '', borderColor: !dec.odGrant ? '#f87171' : '', color: !dec.odGrant ? '#f87171' : '' }}
                            onClick={() => setBosaDecisionField(entry.id, 'odGrant', false)}
                          >
                            Deny OD
                          </button>
                        </div>
                      </div>
                    )}

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0 }}>
                      <span className="small font-semibold">BOSA Comment:</span>
                      <input 
                        type="text" 
                        value={dec.bosaComment} 
                        onChange={(e) => setBosaDecisionField(entry.id, 'bosaComment', e.target.value)} 
                        placeholder="Optional review comment..."
                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                      />
                    </label>
                  </div>

                  <div className="meta">
                    <button className="primary-btn" onClick={async () => {
                      try {
                        const finalDecision = dec.certValid ? 'approved' : 'rejected';
                        await bosaProcessApplication(entry.id, finalDecision, dec.odGrant, dec.bosaComment);
                        setMessage(dec.certValid ? 'Application approved and forwarded to HoD.' : 'Application rejected and completed.');
                      } catch (err) {
                        setMessage(err.message || 'BOSA Member approval failed');
                      }
                    }}>Approve & Forward</button>
                    <button className="danger-btn" onClick={async () => {
                      try {
                        await bosaProcessApplication(entry.id, 'rejected', false, dec.bosaComment);
                        setMessage('Application rejected.');
                      } catch (err) {
                        setMessage(err.message || 'BOSA Member rejection failed');
                      }
                    }}>Reject Submission</button>
                  </div>
                </div>
              );
            }) : <p>No requests pending at BOSA Member stage.</p>}
          </section>
        </>
      )}

      {state.currentRole === 'hod' && (
        <>
          <div className="grid-2 mb-8">
            <div className="card card-gradient-teal p-6">
              <h3 className="text-2xl font-bold">{pendingHod.length}</h3>
              <p className="muted">Requests to Review</p>
            </div>
            <div className="card card-gradient-purple p-6">
              <h3 className="text-2xl font-bold">{facultyApplications.length - pendingHod.length}</h3>
              <p className="muted">Total Processed</p>
            </div>
          </div>
          <section className="panel" style={{ padding: 16 }}>
            <h3>HoD Pending Queue</h3>
            {pendingHod.length ? pendingHod.map((entry) => (
              <div className="queue-card card-gradient-teal" key={entry.id} style={{ marginBottom: 12 }}>
                <h4>{entry.studentName}</h4>
                <p className="small muted">{entry.regNumber} • {entry.year} • {entry.semester}</p>
                <p className="small">Category: {entry.category}</p>
                <p className="small">
                  Attachment:{' '}
                  {entry.attachmentUrl ? (
                    <a href={entry.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      {entry.attachmentName || 'View Document'}
                    </a>
                  ) : (
                    entry.attachmentName || 'No attachment'
                  )}
                </p>
                {entry.odComment && <p className="small">Student Comment: {entry.odComment}</p>}
                {entry.bosaComment && <p className="small">BOSA Comment: {entry.bosaComment}</p>}
                <p className="small font-bold text-teal-400 mt-2">BOSA Member Decision: Certificate Approved • OD {entry.odGranted ? 'Granted' : 'Denied'}</p>
                <div className="meta mt-4">
                  <button className="primary-btn" onClick={async () => {
                    try {
                      await hodProcessApplication(entry.id, 'approved', Boolean(entry.odGranted));
                      setMessage('Application approved by HoD.');
                    } catch (err) {
                      setMessage(err.message || 'HoD approval failed');
                    }
                  }}>Final Approve</button>
                  <button className="danger-btn" onClick={async () => {
                    try {
                      await hodProcessApplication(entry.id, 'rejected', false);
                      setMessage('Application rejected by HoD.');
                    } catch (err) {
                      setMessage(err.message || 'HoD rejection failed');
                    }
                  }}>Reject</button>
                </div>
              </div>
            )) : <p>No requests forwarded to HoD yet.</p>}
          </section>
        </>
      )}
      </div>
    </div>
  );
}

export default App;
