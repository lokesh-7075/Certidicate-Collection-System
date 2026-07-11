import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getDb } from './connection.js';
import { signToken } from '../middleware/auth.js';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary if credentials are set in environment variables
const isCloudinaryConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function uploadToCloudinary(fileDataUri) {
  if (!isCloudinaryConfigured) {
    return fileDataUri; // Fallback to base64 locally
  }
  try {
    const res = await cloudinary.uploader.upload(fileDataUri, {
      folder: 'itcertiod',
    });
    return res.secure_url;
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    return fileDataUri; // Fallback to base64
  }
}

function validateRegistrationNumber(value) {
  return /^[A-Za-z0-9]{3}FA\d{2}[A-Za-z0-9]{3}$/i.test(String(value || '').trim());
}

function normalizeRegNo(regNo) {
  return String(regNo || '').trim().toUpperCase();
}

function roleLabelToDbRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'hod') return 'hod';
  if (r === 'dean' || r === 'bosa') return 'dean';
  if (r === 'student') return 'student';
  return r;
}

export async function registerStudent({ regNo, name, year, semester, password }) {
  const db = getDb();
  const reg = normalizeRegNo(regNo);
  if (!validateRegistrationNumber(reg)) {
    throw new Error('Registration number must follow the pattern xxxFA07xxx.');
  }

  const existing = await db.collection('users').findOne({ regNo: reg });
  if (existing) throw new Error('Registration number already exists');

  const passwordHash = await bcrypt.hash(String(password), 10);

  const doc = {
    _id: new ObjectId(),
    uid: `student-${reg}`,
    role: 'student',
    regNo: reg,
    displayName: String(name || '').trim(),
    year: year || '',
    semester: semester || '',
    passwordHash,
    createdAt: new Date(),
  };

  await db.collection('users').insertOne(doc);

  return { ok: true, uid: doc.uid };
}

export async function loginStudent({ regNo, password }) {
  const db = getDb();
  const reg = normalizeRegNo(regNo);
  const user = await db.collection('users').findOne({ uid: `student-${reg}` });
  if (!user || user.role !== 'student') throw new Error('Invalid student credentials');

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) throw new Error('Invalid student credentials');

  const token = signToken({
    uid: user.uid,
    role: user.role,
    profile: {
      regNo: user.regNo,
      displayName: user.displayName,
      year: user.year,
      semester: user.semester,
      role: user.role,
    },
  });

  return {
    ok: true,
    token,
    user: {
      uid: user.uid,
      role: 'student',
      regNo: user.regNo,
      displayName: user.displayName,
      year: user.year,
      semester: user.semester,
    },
  };
}

export async function loginFaculty({ facultyId, password }) {
  const db = getDb();
  const fid = String(facultyId || '').trim();
  const user = await db.collection('users').findOne({ facultyId: fid });
  if (!user) throw new Error(`FacultyId not found: ${fid}`);

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) throw new Error('Invalid faculty credentials');

  const token = signToken({
    uid: user.uid,
    role: user.role,
    profile: {
      displayName: user.displayName,
      facultyId: user.facultyId,
      department: user.department,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      profileImageUrl: user.profileImageUrl || '',
      role: user.role,
    },
  });

  return {
    ok: true,
    token,
    user: {
      uid: user.uid,
      role: user.role,
      facultyId: user.facultyId,
      displayName: user.displayName,
      department: user.department,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      profileImageUrl: user.profileImageUrl || '',
    },
  };
}

export async function submitApplication(user, body) {
  if (user.role !== 'student') throw new Error('Only students can submit');

  const db = getDb();
  const applicantUid = user.uid;

  const fileData = body.attachmentUrl;
  let finalAttachmentUrl = fileData || null;
  if (fileData && fileData.startsWith('data:')) {
    finalAttachmentUrl = await uploadToCloudinary(fileData);
  }

  const appDoc = {
    _id: new ObjectId(),
    appId: String(body.appId || new ObjectId().toHexString()),
    applicantUid,
    applicantName: body.applicantName,
    regNo: body.regNo,
    submissionType: body.submissionType,
    category: body.category,
    details: body.details || {},
    attachmentUrl: finalAttachmentUrl,
    attachmentName: body.attachmentName || (body.details?.attachmentName || 'Uploaded attachment'),
    odRequested: Boolean(body.details?.odRequested),
    odComment: body.details?.odComment || '',
    fromDate: body.details?.fromDate,
    toDate: body.details?.toDate,
    status: 'pending',
    validated: false,
    validatedReason: null,
    createdAt: new Date(),
  };

  // validation (mimic trigger)
  const required = ['fromDate', 'toDate'];
  for (const f of required) {
    if (!appDoc.details?.[f]) {
      appDoc.status = 'rejected';
      appDoc.validated = false;
      appDoc.validatedReason = `Missing ${f}`;
      await db.collection('requests').insertOne(appDoc);
      await db.collection('notifications').insertOne({
        _id: new ObjectId(),
        recipientUid: applicantUid,
        type: 'validation',
        message: `Submission rejected: missing ${f}`,
        read: false,
        createdAt: new Date(),
      });
      return { ok: true, appId: appDoc.appId, status: appDoc.status };
    }
  }
  if (!appDoc.attachmentUrl) {
    appDoc.status = 'rejected';
    appDoc.validatedReason = 'Missing attachment';
    await db.collection('requests').insertOne(appDoc);
    await db.collection('notifications').insertOne({
      _id: new ObjectId(),
      recipientUid: applicantUid,
      type: 'validation',
      message: 'Submission rejected: missing attachment',
      read: false,
      createdAt: new Date(),
    });
    return { ok: true, appId: appDoc.appId, status: appDoc.status };
  }

  appDoc.validated = true;
  appDoc.validatedReason = null;
  appDoc.status = 'pending';

  await db.collection('requests').insertOne(appDoc);
  return { ok: true, appId: appDoc.appId, status: appDoc.status };
}

export async function listApplicationsForUser(userUid) {
  const db = getDb();
  const apps = await db.collection('requests').find({ applicantUid: userUid }).sort({ createdAt: -1 }).toArray();
  return { ok: true, applications: apps.map(formatApplication) };
}

export async function listApplicationsByStatus(status) {
  const db = getDb();
  const apps = await db.collection('requests').find({ status }).sort({ createdAt: -1 }).toArray();
  return { ok: true, applications: apps.map(formatApplication) };
}

function formatApplication(a) {
  return {
    id: a.appId,
    ...a,
    details: a.details,
    category: a.category,
    studentId: a.applicantUid,
    studentName: a.applicantName,
    regNumber: a.regNo,
    attachmentName: a.attachmentName || 'Uploaded attachment',
    odRequested: a.odRequested,
    odComment: a.odComment || '',
    bosaDecision: a.bosaDecision || null,
    hodDecision: a.hodDecision || null,
    odGranted: a.odGranted || null,
    hodDecisionLabel: a.hodDecision || null,
  };
}

export async function getNotifications(uid) {
  const db = getDb();
  const notes = await db.collection('notifications').find({ recipientUid: uid }).sort({ createdAt: -1 }).toArray();
  return { ok: true, notifications: notes.map((n) => ({ id: n._id.toHexString(), ...n })) };
}

export async function bosaProcessApplication(user, appId, { bosaDecision, odGrant = null, bosaComment = null }) {
  const role = user.role;
  if (!(role === 'dean' || role === 'bosa' || role === 'hod' ? false : true)) {
    // allow only dean/bosa
  }
  if (!(role === 'dean' || role === 'bosa')) {
    throw new Error('Only Dean/BOSA can perform this action');
  }

  const db = getDb();
  const apps = db.collection('requests');
  const app = await apps.findOne({ appId: String(appId) });
  if (!app) throw new Error('Application not found');

  const update = {
    bosaDecision: bosaDecision,
    bosaUid: user.uid,
    bosaComment: bosaComment || null,
    forwarded: bosaDecision === 'approved',
    forwardedAt: new Date(),
  };

  if (bosaDecision === 'rejected') {
    update.status = 'rejected';
  } else {
    update.status = 'forwarded';
  }

  if (typeof odGrant === 'boolean') update.odGranted = odGrant;

  await apps.updateOne({ appId: String(appId) }, { $set: update });

  await db.collection('notifications').insertOne({
    _id: new ObjectId(),
    recipientUid: app.applicantUid,
    type: 'bosaDecision',
    message: `Dean decision: ${bosaDecision}`,
    read: false,
    createdAt: new Date(),
  });

  return { ok: true };
}

export async function hodProcessApplication(user, appId, { hodDecision, odGrant = false, hodComment = null }) {
  if (user.role !== 'hod') throw new Error('Only HoD can perform this action');

  const db = getDb();
  const apps = db.collection('requests');
  const app = await apps.findOne({ appId: String(appId) });
  if (!app) throw new Error('Application not found');

  if (!app.forwarded) throw new Error('Application has not been forwarded by Dean');

  const update = {
    hodDecision: hodDecision,
    hodUid: user.uid,
    hodComment: hodComment || null,
    hodAt: new Date(),
  };

  if (hodDecision === 'approved') {
    update.status = 'approved';
    update.odGranted = Boolean(odGrant);
  } else {
    update.status = 'rejected';
    update.odGranted = false;
  }

  await apps.updateOne({ appId: String(appId) }, { $set: update });

  let statusLabel = 'Rejected';
  if (hodDecision === 'approved') {
    statusLabel = update.odGranted ? 'OD - OK / Certificate Approved' : 'OD - NO / Certificate Approved';

    // Insert into approvals collection
    await db.collection('approvals').insertOne({
      _id: new ObjectId(),
      approvalId: new ObjectId().toHexString(),
      requestId: app.appId,
      studentName: app.applicantName,
      regNo: app.regNo,
      category: app.category,
      submissionType: app.submissionType,
      attachmentUrl: app.attachmentUrl,
      attachmentName: app.attachmentName,
      status: 'approved',
      approvedAt: new Date(),
      hodUid: user.uid,
    });

    // If OD is requested and granted, insert into ods collection
    if (app.odRequested && update.odGranted) {
      await db.collection('ods').insertOne({
        _id: new ObjectId(),
        odId: new ObjectId().toHexString(),
        requestId: app.appId,
        studentName: app.applicantName,
        regNo: app.regNo,
        category: app.category,
        submissionType: app.submissionType,
        attachmentUrl: app.attachmentUrl,
        attachmentName: app.attachmentName,
        odComment: app.odComment || '',
        odGrantedAt: new Date(),
        hodUid: user.uid,
      });
    }
  }

  await db.collection('notifications').insertOne({
    _id: new ObjectId(),
    recipientUid: app.applicantUid,
    type: 'finalDecision',
    message: statusLabel,
    read: false,
    createdAt: new Date(),
  });

  return { ok: true };
}

export async function updateFacultyProfile(user, body) {
  const callerUid = user.uid;
  const targetUid = body.uid || callerUid;

  if (callerUid !== targetUid) {
    throw new Error('Not authorized to update this profile');
  }

  const allowed = ['displayName', 'phoneNumber', 'gender', 'profileImageUrl', 'department'];
  const updates = {};
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  if (updates.profileImageUrl && updates.profileImageUrl.startsWith('data:')) {
    updates.profileImageUrl = await uploadToCloudinary(updates.profileImageUrl);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No profile fields provided');
  }

  const db = getDb();
  await db.collection('users').updateOne(
    { uid: targetUid },
    { $set: updates }
  );

  const updatedUser = await db.collection('users').findOne({ uid: targetUid });
  const token = signToken({
    uid: updatedUser.uid,
    role: updatedUser.role,
    profile: {
      displayName: updatedUser.displayName,
      facultyId: updatedUser.facultyId,
      department: updatedUser.department,
      phoneNumber: updatedUser.phoneNumber,
      gender: updatedUser.gender,
      profileImageUrl: updatedUser.profileImageUrl || '',
      role: updatedUser.role,
    },
  });

  return { ok: true, updated: updates, token };
}

