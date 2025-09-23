const { google } = require('googleapis');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

// --- Configuration ---
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const KEYFILE = path.join(__dirname, 'gcp-credentials.json');
const DRIVE_FOLDER_ID = '1fxSeHlV3K9HG79TQzLllpw6dJqQnLkhi';
const GCS_BUCKET_NAME = 'sow-agent-bucket';
const GCS_DESTINATION_PREFIX = 'Sow Delivery Catalogues/';

// --- Clients ---
const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILE,
    scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });
const storage = new Storage({ keyFilename: KEYFILE });
const bucket = storage.bucket(GCS_BUCKET_NAME);


// Function to list available files in Google Drive
async function listFiles() {
    try {
        const response = await drive.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and (name = 'Test file' or name = 'Test file 2')`,
            pageSize: 200,
            fields: 'nextPageToken, files(id, name, mimeType)',
        });

        const files = response.data.files;
        if (files && files.length > 0) {
            console.log('Found files:', files.map(f => `${f.name} (${f.mimeType})`));
            return files;
        } else {
            console.log('No files found.');
            return [];
        }
    } catch (error) {
        throw new Error(`Error listing files in Google Drive: ${error.message}`);
    }
}

/**
 * Streams a single file from Google Drive to Google Cloud Storage.
 * Handles both regular files and Google Workspace files (Docs, Sheets, etc.).
 * @param {object} file The file object from the Drive API.
 */
async function transferFile(file) {
    return new Promise(async (resolve, reject) => {
        let driveStream;
        let finalFileName = file.name;

        console.log(`-> Processing: ${file.name}`);

        if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            // This is a Google Doc/Sheet/etc. It needs to be exported.
            let exportMimeType, exportExtension;
            switch (file.mimeType) {
                case 'application/vnd.google-apps.document':
                    exportMimeType = 'application/pdf';
                    exportExtension = '.pdf';
                    break;
                case 'application/vnd.google-apps.spreadsheet':
                    exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    exportExtension = '.xlsx';
                    break;
                default:
                    console.log(`   - Skipping unsupported Google file type: ${file.mimeType}`);
                    return resolve(); // Skip this file
            }

            finalFileName += exportExtension;
            console.log(`   - Exporting as ${exportExtension}`);
            driveStream = await drive.files.export(
                { fileId: file.id, mimeType: exportMimeType },
                { responseType: 'stream' }
            );
        } else {
            // This is a regular binary file (PDF, image, etc.).
            driveStream = await drive.files.get(
                { fileId: file.id, alt: 'media' },
                { responseType: 'stream' }
            );
        }

        const gcsFile = bucket.file(`${GCS_DESTINATION_PREFIX}${finalFileName}`);
        const gcsWriteStream = gcsFile.createWriteStream();

        driveStream.data
            .on('end', () => {
                console.log(`✅ Successfully uploaded ${finalFileName}.`);
                resolve();
            })
            .on('error', err => reject(`❌ Error uploading ${finalFileName}: ${err}`))
            .pipe(gcsWriteStream);
    });
}

async function main() {
    try {
        const filesToUpload = await listFiles();
        if (filesToUpload.length === 0) return;

        const uploadPromises = filesToUpload.map(transferFile);
        await Promise.all(uploadPromises);
        console.log('\nAll files have been processed.');
    } catch (error) {
        console.error(error);
    }
}

main();