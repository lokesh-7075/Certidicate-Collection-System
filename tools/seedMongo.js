import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import dns from 'dns';

// Set public DNS servers to resolve SRV records properly in Node.js
try {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch (e) {
  // fallback silently
}

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/itcertiod';
const dbName = process.env.MONGODB_DB || 'itcertiod';

async function seed() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to database: ${dbName}`);

  // Clear collections
  console.log('Cleaning collections...');
  await db.collection('users').deleteMany({});
  await db.collection('requests').deleteMany({});
  await db.collection('approvals').deleteMany({});
  await db.collection('ods').deleteMany({});
  await db.collection('notifications').deleteMany({});

  console.log('Hashing passwords...');
  const studentHash = await bcrypt.hash('student123', 10);
  const deanHash = await bcrypt.hash('bosa123', 10);
  const hodHash = await bcrypt.hash('hod123', 10);

  const users = [
    {
      uid: 'student-123FA07123',
      role: 'student',
      regNo: '123FA07123',
      displayName: 'Asha Kumar',
      year: 'III',
      semester: 'V',
      passwordHash: studentHash,
      department: 'IT',
      createdAt: new Date(),
    },
    {
      uid: 'faculty-bosa-1',
      role: 'dean',
      facultyId: 'BOSA001',
      displayName: 'Ravi Menon',
      department: 'IT',
      phoneNumber: '9876543210',
      gender: 'Male',
      passwordHash: deanHash,
      profileImageUrl: 'https://ui-avatars.com/api/?name=Ravi+Menon&background=2563eb&color=fff',
      createdAt: new Date(),
    },
    {
      uid: 'faculty-hod-1',
      role: 'hod',
      facultyId: 'HOD001',
      displayName: 'Dr. Suresh Iyer',
      department: 'IT',
      phoneNumber: '9123456780',
      gender: 'Male',
      passwordHash: hodHash,
      profileImageUrl: 'https://ui-avatars.com/api/?name=Dr.+Suresh+Iyer&background=0f172a&color=fff',
      createdAt: new Date(),
    },
  ];

  console.log('Inserting seed users...');
  await db.collection('users').insertMany(users);

  console.log('Inserting seed requests...');
  await db.collection('requests').insertOne({
    _id: new ObjectId(),
    appId: new ObjectId().toHexString(),
    applicantUid: 'student-lokesh-1',
    applicantName: 'Lokesh Sainani',
    regNo: '22FA1A0512',
    submissionType: 'tech',
    category: 'Technical Achievement',
    details: {
      eventName: 'Codeathon 2026',
      fromDate: '2026-07-10',
      toDate: '2026-07-11',
      odRequested: true,
      odComment: 'Requesting OD for attending the coding competition.',
    },
    attachmentUrl: 'https://res.cloudinary.com/demo/image/upload/v1371261763/sample.jpg',
    attachmentName: 'certificate.jpg',
    status: 'pending',
    validated: true,
    validatedReason: null,
    createdAt: new Date(),
  });

  console.log('Inserting seed approvals...');
  await db.collection('approvals').insertOne({
    _id: new ObjectId(),
    approvalId: new ObjectId().toHexString(),
    requestId: new ObjectId().toHexString(),
    studentName: 'Lokesh Sainani',
    regNo: '22FA1A0512',
    category: 'Technical Achievement',
    submissionType: 'tech',
    attachmentUrl: 'https://res.cloudinary.com/demo/image/upload/v1371261763/sample.jpg',
    attachmentName: 'certificate.jpg',
    status: 'approved',
    approvedAt: new Date(),
    hodUid: 'faculty-hod-1',
  });

  console.log('Inserting seed ods...');
  await db.collection('ods').insertOne({
    _id: new ObjectId(),
    odId: new ObjectId().toHexString(),
    requestId: new ObjectId().toHexString(),
    studentName: 'Lokesh Sainani',
    regNo: '22FA1A0512',
    category: 'Technical Achievement',
    submissionType: 'tech',
    attachmentUrl: 'https://res.cloudinary.com/demo/image/upload/v1371261763/sample.jpg',
    attachmentName: 'certificate.jpg',
    odComment: 'Approved codeathon attendance.',
    odGrantedAt: new Date(),
    hodUid: 'faculty-hod-1',
  });

  console.log('Seed completed successfully!');
  await client.close();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
