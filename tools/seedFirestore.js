/**
 * Seed script for Firestore collections used by ITCertiOD.
 * Usage:
 *   Set environment variable GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file
 *   node tools/seedFirestore.js
 *
 * WARNING: This script writes to your Firestore. Use only for development.
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

async function upsertAuthUser({ email, password, displayName, role }) {
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password, displayName });
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    userRecord = await admin.auth().createUser({ email, password, displayName });
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, { role });
  return userRecord.uid;
}

async function seed() {
  const deanUid = await upsertAuthUser({
    email: process.env.SEED_DEAN_EMAIL || 'dean@itcertiod.local',
    password: process.env.SEED_DEAN_PASSWORD || 'Dean@12345',
    displayName: process.env.SEED_DEAN_ID || 'DEAN001',
    role: 'dean',
  });

  const deanProfile = {
    uid: deanUid,
    email: process.env.SEED_DEAN_EMAIL || 'dean@itcertiod.local',
    displayName: 'Dean',
    facultyId: process.env.SEED_DEAN_ID || 'DEAN001',
    role: 'dean',
    department: 'CSE',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(deanUid).set(deanProfile, { merge: true });

  const hodUid = await upsertAuthUser({
    email: process.env.SEED_HOD_EMAIL || 'hod@itcertiod.local',
    password: process.env.SEED_HOD_PASSWORD || 'Hod@12345',
    displayName: process.env.SEED_HOD_ID || 'HOD001',
    role: 'hod',
  });

  const hodProfile = {
    uid: hodUid,
    email: process.env.SEED_HOD_EMAIL || 'hod@itcertiod.local',
    displayName: 'Head of Department',
    facultyId: process.env.SEED_HOD_ID || 'HOD001',
    role: 'hod',
    department: 'CSE',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(hodUid).set(hodProfile, { merge: true });

  // sample student
  const studentUid = await upsertAuthUser({
    email: process.env.SEED_STUDENT_EMAIL || '18fa07cs001@itcertiod.local',
    password: process.env.SEED_STUDENT_PASSWORD || 'Student@12345',
    displayName: '18FA07CS001',
    role: 'student',
  });

  const student = {
    uid: studentUid,
    email: process.env.SEED_STUDENT_EMAIL || '18fa07cs001@itcertiod.local',
    displayName: 'Alice Student',
    role: 'student',
    regNo: '18FA07CS001',
    department: 'CSE',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(studentUid).set(student, { merge: true });

  // sample application
  const appDoc = {
    applicantUid: student.uid,
    applicantName: student.displayName,
    regNo: student.regNo,
    submissionType: 'technical',
    category: 'Participation',
    eventName: 'Mini Hackathon',
    domain: 'Web',
    fromDate: '2026-06-01',
    toDate: '2026-06-02',
    odRequested: true,
    odComment: 'Required for placement activity',
    attachmentUrl: 'https://example.com/cert.pdf',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const docRef = await db.collection('applications').add(appDoc);
  console.log('Seeded application:', docRef.id);

  console.log('Seeded users collection: Dean, HoD, and student');
  console.log('Dean login:', deanProfile.facultyId, process.env.SEED_DEAN_PASSWORD || 'Dean@12345');
  console.log('HoD login:', hodProfile.facultyId, process.env.SEED_HOD_PASSWORD || 'Hod@12345');
  console.log('Student login:', student.regNo, process.env.SEED_STUDENT_PASSWORD || 'Student@12345');
  console.log('Seeding complete');
}

seed().catch((err) => {
  console.error('Seeding failed', err);
  process.exit(1);
});
