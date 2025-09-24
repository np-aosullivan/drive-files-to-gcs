// This script is for local testing only.
// It directly invokes the Cloud Function to test its logic.

// Load environment variables from a .env file
require('dotenv').config();

const { transferDriveFilesToGCS } = require('./index.js');

async function runTest() {
  console.log('--- Running local test ---');
  try {
    // Simulate the Pub/Sub event object. The payload is not used by this function.
    const mockPubSubEvent = { data: 'test' };
    const mockContext = {};

    await transferDriveFilesToGCS(mockPubSubEvent, mockContext);
    console.log('--- ✅ Local test finished successfully ---');
  } catch (error) {
    console.error('--- ❌ Local test failed ---', error);
    process.exit(1);
  }
}

runTest();
