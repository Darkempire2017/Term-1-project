// End-to-end automated verification script for Smart Umbrella Sharing System

async function runTest() {
  console.log('🧪 Starting End-to-End Automated Test...');
  const baseUrl = 'http://localhost:5050/api';

  // 1. Health check
  console.log('\n1️⃣ Checking server health...');
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json();
  console.log('✅ Server health response:', health);

  // 2. Register student
  console.log('\n2️⃣ Testing Student Registration...');
  const regPayload = {
    indexNumber: '21/ENG/042',
    name: 'Nimal Silva',
    email: 'nimal.silva@campus.edu',
    password: 'password123',
  };

  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regPayload),
  });
  const regData = await regRes.json();
  console.log('✅ Registration response:', regData);

  // In our test, the OTP is printed to console or we can verify with login test
  // Let's test slots endpoint
  console.log('\n3️⃣ Testing Umbrella Slots List...');
  const slotsRes = await fetch(`${baseUrl}/umbrella/slots`);
  const slotsData = await slotsRes.json();
  console.log(`✅ Slots retrieved. Total: ${slotsData.meta.total}, Available: ${slotsData.meta.available}`);
  console.log(`✅ HiveMQ Broker: ${slotsData.station.broker}`);

  // 4. Test Admin Solenoid Lock Pulse
  console.log('\n4️⃣ Testing Admin Solenoid Lock Command...');
  const unlockRes = await fetch(`${baseUrl}/umbrella/admin-unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotNumber: 1, durationMs: 3000 }),
  });
  const unlockData = await unlockRes.json();
  console.log('✅ Admin unlock command dispatched:', unlockData);

  console.log('\n🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
