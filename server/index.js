import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectToMongo } from './mongo/connection.js';
import { requireAuth } from './middleware/auth.js';
import {
  registerStudent,
  loginStudent,
  loginFaculty,
  submitApplication,
  listApplicationsForUser,
  listApplicationsByStatus,
  listApplicationsForBosa,
  listApplicationsForHod,
  getNotifications,
  bosaProcessApplication,
  hodProcessApplication,
  updateFacultyProfile,
  registerBosaMember,
  changeFacultyPassword,
} from './mongo/controllers.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

// Middleware to ensure Mongo is connected (handles serverless lifecycle)
app.use(async (req, res, next) => {
  try {
    await connectToMongo();
    next();
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Database connection failed: ' + err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/register/student', async (req, res) => {
  try {
    const result = await registerStudent(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/auth/login/student', async (req, res) => {
  try {
    const result = await loginStudent(req.body);
    res.json(result);
  } catch (e) {
    res.status(401).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/auth/login/faculty', async (req, res) => {
  try {
    const result = await loginFaculty(req.body);
    res.json(result);
  } catch (e) {
    res.status(401).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/auth/faculty', async (req, res) => {
  try {
    const result = await loginFaculty(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/auth/register/bosa', requireAuth, async (req, res) => {
  try {
    const result = await registerBosaMember(req.user, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/auth/change-password', requireAuth, async (req, res) => {
  try {
    const result = await changeFacultyPassword(req.user, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/applications', requireAuth, async (req, res) => {
  try {
    const result = await submitApplication(req.user, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/applications', requireAuth, async (req, res) => {
  try {
    const { userUid, status } = req.query;
    let result;
    if (req.user.role === 'dean' || req.user.role === 'bosa') {
      result = await listApplicationsForBosa();
    } else if (req.user.role === 'hod') {
      result = await listApplicationsForHod();
    } else {
      result = status
        ? await listApplicationsByStatus(String(status))
        : await listApplicationsForUser(String(userUid || req.user.uid));
    }
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/applications/:appId/bosa', requireAuth, async (req, res) => {
  try {
    const result = await bosaProcessApplication(req.user, req.params.appId, req.body);
    res.json(result);
  } catch (e) {
    res.status(403).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/applications/:appId/hod', requireAuth, async (req, res) => {
  try {
    const result = await hodProcessApplication(req.user, req.params.appId, req.body);
    res.json(result);
  } catch (e) {
    res.status(403).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/notifications', requireAuth, async (req, res) => {
  try {
    const result = await getNotifications(req.user.uid);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/faculty/profile', requireAuth, async (req, res) => {
  try {
    const result = await updateFacultyProfile(req.user, req.body);
    res.json(result);
  } catch (e) {
    res.status(403).json({ ok: false, error: e?.message || String(e) });
  }
});

export default app;

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  connectToMongo().then(() => {
    app.listen(port, () => console.log(`Mongo API listening on http://localhost:${port}`));
  }).catch(err => {
    console.error('Failed to connect to Mongo on startup:', err);
  });
}

