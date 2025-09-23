const { google } = require('googleapis');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const KEYFILE = path.join(__dirname, 'gcp-credentials.json');
const DRIVE_FOLDER_ID = '1fxSeHlV3K9HG79TQzLllpw6dJqQnLkhi';

// Function to authorize and get access to Google Drive API
async function authorize() {
    try {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEYFILE,
        scopes: SCOPES
    });
    return auth;

    } catch (error) {
        throw new Error(`Error authorizing Google Drive API: ${error.message}`);
    }
}

// Function to list available files in Google Drive
async function listFiles(auth) {
    const drive = google.drive({ version: 'v3', auth });

    try {
        const response = await drive.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and (name = 'Test file' or name = 'Test file 2')`,
            pageSize: 200,
            fields: 'nextPageToken, files(id, name)',
        });

        const files = response.data.files;
        if (files.length) {
            console.log('Available files:');
            files.forEach(file => {
                console.log(`${file.name} (${file.id})`);
            });
        } else {
            console.log('No files found.');
        }
    } catch (error) {
        throw new Error(`Error listing files in Google Drive: ${error.message}`);
    }
}


async function main() {
    try {
        const authClient = await authorize();

        await listFiles(authClient);

    } catch (error) {
        console.error(error);
    }
}


main();