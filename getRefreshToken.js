const { google } = require('googleapis');
const readline = require('readline');

// Load environment variables from a .env file for this script
require('dotenv').config();

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
// This is a standard redirect URI for desktop apps
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const oauth2Client = new google.auth.OAuth2(
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  REDIRECT_URI
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getNewToken() {
  if (OAUTH_CLIENT_ID === 'YOUR_CLIENT_ID') {
    console.error('ERROR: Please replace YOUR_CLIENT_ID and YOUR_CLIENT_SECRET in getRefreshToken.js with the credentials you created.');
    rl.close();
    return;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  rl.question('Enter the code from that page here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log('\n✅ Successfully retrieved tokens!');
      console.log('Your Refresh Token is (store this securely!):\n');
      console.log(tokens.refresh_token);
      console.log('\nAdd this and your client credentials to your .env file and/or Secret Manager.');
    } catch (err) {
      console.error('Error retrieving access token', err.message);
    }
  });
}

getNewToken();
