const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');

// --- Configuration (Best practice: use environment variables in the cloud) ---
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const GCS_DESTINATION_PREFIX = process.env.GCS_DESTINATION_PREFIX;

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// --- Clients ---
// Create an auth object that specifies the required scopes.
// It will automatically use ADC to find credentials (from .env locally,
// or from the runtime environment in the cloud).
const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth: auth });
const storage = new Storage();
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
            const exportMimeType = 'application/pdf';
            finalFileName = `${file.name}.pdf`; // Append .pdf to the name
            console.log(`Exporting Google Doc "${file.name}" as PDF to GCS...`);

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

/**
 * The entry point for the Cloud Function, triggered by Cloud Scheduler.
 * @param {object} pubSubMessage The event payload.
 * @param {object} context The event metadata.
 */
exports.transferDriveFilesToGCS = async (pubSubMessage, context) => {
    console.log('Cloud Function triggered to transfer files from Drive to GCS.');
    try {
        const filesToUpload = await listFiles();
        if (!filesToUpload || filesToUpload.length === 0) {
            console.log('No files found to process.');
            return;
        }

        const uploadPromises = filesToUpload.map(transferFile);
        await Promise.all(uploadPromises);
        console.log('\nAll files have been processed.');
    } catch (error) {
        console.error('FATAL: An error occurred during the transfer process:', error.message);
        throw error; // Throwing error marks the function execution as failed for monitoring.
    }
}
