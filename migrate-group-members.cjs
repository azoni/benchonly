/**
 * One-time migration: Backfill groupMembers on existing groupWorkout docs
 * Run: npm install dotenv && node migrate-group-members.cjs
 */

require('dotenv').config();
const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Missing env vars:');
  if (!projectId) console.error('   - FIREBASE_PROJECT_ID');
  if (!clientEmail) console.error('   - FIREBASE_CLIENT_EMAIL');
  if (!privateKey) console.error('   - FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

console.log(`Using project: ${projectId}`);
console.log(`Using email: ${clientEmail}\n`);

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

async function migrate() {
  console.log('=== Backfill groupMembers on groupWorkouts ===\n');

  const groupsSnap = await db.collection('groups').get();
  const groupMap = {};
  groupsSnap.forEach(doc => {
    const data = doc.data();
    groupMap[doc.id] = {
      members: data.members || [],
      admins: data.admins || [],
    };
  });
  console.log(`Loaded ${Object.keys(groupMap).length} groups\n`);

  const workoutsSnap = await db.collection('groupWorkouts').get();

  let updated = 0;
  let skipped = 0;
  let orphaned = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of workoutsSnap.docs) {
    const data = doc.data();

    if (data.groupMembers && data.groupMembers.length > 0) {
      skipped++;
      continue;
    }

    const group = groupMap[data.groupId];
    if (!group) {
      console.log(`  ⚠ Orphaned workout ${doc.id} — groupId "${data.groupId}" not found`);
      orphaned++;
      continue;
    }

    batch.update(doc.ref, {
      groupMembers: group.members,
      groupAdmins: group.admins,
    });
    batchCount++;
    updated++;

    if (batchCount >= 500) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n=== Done ===`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped} (already had groupMembers)`);
  console.log(`  Orphaned: ${orphaned} (group not found)`);
  console.log(`  Total:    ${workoutsSnap.size}`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
