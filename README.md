# Google Drive to Cloud Storage Transfer

A Cloud Function to automatically copy specific files from a Google Drive folder to a Google Cloud Storage bucket on a nightly schedule.

## 1. Prerequisites

Before you begin, you need to set up your Google Cloud environment.

### Enable Google Cloud APIs

Enable the following APIs in your Google Cloud project:
- Cloud Functions API
- Cloud Storage API
- Cloud Scheduler API
- Cloud Pub/Sub API
- Google Drive API

### Create a Service Account

This function runs with its own identity. Create a service account and grant it the following IAM roles:
- **Storage Object Admin** (`roles/storage.objectAdmin`): Allows the function to create and overwrite files in your Cloud Storage bucket.
- **Cloud Functions Invoker** (`roles/cloudfunctions.invoker`): Allows Cloud Scheduler to trigger your function.
- **Pub/Sub Publisher** (`roles/pubsub.publisher`): Allows Cloud Scheduler to publish a message to trigger the function.

## 2. Configuration

### Grant Google Drive Access

Share the Google Drive Folder containing your files with the service account's email address. Grant it at least **Viewer** access.

### Environment Variables

The function is configured using environment variables. For deployment, you will set these in the Cloud Console or via the gcloud command.

- `DRIVE_FOLDER_ID`: The ID of the folder in Google Drive.
- `GCS_BUCKET_NAME`: The name of the destination bucket in Cloud Storage.
- `GCS_DESTINATION_PREFIX`: The destination folder within the Storage Bucket. Make sure to end this with a `/`.

###

## 3. Local Development & Testing

You can test the function on your local machine before deploying. This setup uses a `.env` file to manage local secrets and configuration.

1.  **Generate a Service Account Key**:
    - Go to your service account in the IAM & Admin console.
    - Navigate to the **KEYS** tab, click **ADD KEY** > **Create new key**, and download the JSON file.
    - Save this file somewhere safe on your machine. The `.gitignore` file is already configured to prevent you from accidentally committing key files.

2.  **Set Environment Variables**:
    - Create a file named `.env` in the root of the project.
    - Add the following content to it, replacing the placeholder values with your actual configuration. Use the **full, absolute path** to your downloaded service account key.

    ```
    # .env file for local testing
    GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/downloaded-key-file.json"
    DRIVE_FOLDER_ID="YOUR_DRIVE_FOLDER_ID"
    GCS_BUCKET_NAME="YOUR_GCS_BUCKET_NAME"
    GCS_DESTINATION_PREFIX="your-prefix/"
    ```

3.  **Run the Test**:
    Install dependencies and run the local test script.

    ```bash
    npm install # Only needed the first time
    node local-runner.js
    ```

## 4. Deployment

You can deploy the function using the Cloud Console or the `gcloud` CLI.

### Create a Pub/Sub Topic

The function is triggered by a message on a Pub/Sub topic. Create one if it doesn't exist:
```bash
gcloud pubsub topics create drive-transfer-topic
```

### Deploy the Function

Run the following command, replacing `<your-service-account>` with the email of the service account you created.
```bash
gcloud functions deploy transferDriveToGCS \
  --runtime nodejs18 \
  --trigger-topic drive-transfer-topic \
  --entry-point transferDriveFilesToGCS \
  --service-account <your-service-account> \
  --region europe-west2 \
  --timeout 540s \
  --set-env-vars DRIVE_FOLDER_ID=YOUR_DRIVE_FOLDER_ID,GCS_BUCKET_NAME=YOUR_GCS_BUCKET_NAME,GCS_DESTINATION_PREFIX="YOUR_DESTINATION_PREFIX
```

## 5. Scheduling

Create a Cloud Scheduler job to run the function nightly. This example runs at 2:00 AM daily.

```bash
gcloud scheduler jobs create pubsub nightly-drive-transfer \
  --schedule "0 2 * * *" \
  --topic drive-transfer-topic \
  --message-body "Run" \
  --time-zone "Europe/London"
```
