# Google Drive to Cloud Storage Transfer

A Cloud Function to automatically copy specific files from a Google Drive folder to a Google Cloud Storage bucket on a nightly schedule.
This function authenticates to the Google Drive API on behalf of a user via OAuth2.

## 1. Prerequisites

Before you begin, you need to set up your Google Cloud environment.

### Enable Google Cloud APIs

Enable the following APIs in your Google Cloud project:
- Cloud Functions API
- Cloud Storage API
- Cloud Scheduler API
- Cloud Pub/Sub API
- Google Drive API

### Set gcloud Project (if needed)

Ensure your `gcloud` CLI is configured to the correct project where you intend to deploy this function.

To view the project that is currently set, run:
```bash
gcloud config list project
```

To set a new project, run:
```bash
gcloud config set project YOUR_PROJECT_ID
```

### Create the Function's Service Account

This function runs with its own identity. Create a service account for the function and grant it the following IAM roles on your project. This identity is used by the function to write to your Cloud Storage bucket.
- **Storage Object Admin** (`roles/storage.objectAdmin`): Allows the function to create and overwrite files in your Cloud Storage bucket.
- **Cloud Run Invoker** (`roles/run.invoker`): Allows the Pub/Sub trigger to invoke this 2nd gen function's underlying Cloud Run service.
- **Secret Manager Secret Accessor** (`roles/secretmanager.secretAccessor`): (Recommended) Allows the function to read secrets like the OAuth Refresh Token.

The permission for the scheduler will be configured in a later step.

## 2. Authentication Setup (One-Time)

This function acts on behalf of a real user to access Google Drive. To authorize this, you must generate OAuth2 credentials and a refresh token.

1.  **Create OAuth 2.0 Credentials**:
    - In the Google Cloud Console, go to **APIs & Services > Credentials**.
    - Click **+ CREATE CREDENTIALS** and select **OAuth client ID**.
    - For **Application type**, select **Desktop app** and give it a name.
    - A window will pop up with your **Client ID** and **Client Secret**. Copy these.

2.  **Get a Refresh Token**:
    - Create a file named `.env` in the root of the project.
    - Add your Client ID and Secret to it:
      ```.env
      OAUTH_CLIENT_ID="YOUR_CLIENT_ID_FROM_STEP_1"
      OAUTH_CLIENT_SECRET="YOUR_CLIENT_SECRET_FROM_STEP_1"
      ```
    - Run the `getRefreshToken.js` script. This script needs to be run by the user who has access to the target Google Drive folder.
      ```bash
      npm install # If you haven't already
      node getRefreshToken.js
      ```
    - The script will print a URL. Visit this URL in a browser, log in as the user with Drive access, and grant permission.
    - Copy the authorization code from the browser and paste it into your terminal.
    - The script will output your **Refresh Token**. Copy this token and keep it secure.

## 3. Configuration

The function is configured using environment variables. For deployment, it is **highly recommended** to store `OAUTH_CLIENT_SECRET` and `OAUTH_REFRESH_TOKEN` in Secret Manager.

- `DRIVE_FOLDER_ID`: The ID of the folder in Google Drive.
- `SHARED_DRIVE_ID`: (Optional) The ID of the Shared Drive if the folder is located there.
- `GCS_BUCKET_NAME`: The name of the destination bucket in Cloud Storage.
- `GCS_DESTINATION_PREFIX`: The destination folder within the Storage Bucket. Make sure to end this with a `/`.

**Sensitive Variables (Use Secret Manager for these in production)**:
- `OAUTH_CLIENT_ID`: The OAuth2 Client ID you created. 
- `OAUTH_CLIENT_SECRET`: The OAuth2 Client Secret.
- `OAUTH_REFRESH_TOKEN`: The long-lived refresh token you generated.


---
 
## 3. Local Development & Testing

You can test the function on your local machine before deploying. This setup uses a `.env` file to manage local secrets and configuration.

1.  **Set Environment Variables**:
    - Complete your `.env` file with all the required variables from the Configuration section above.

    ```
    # .env file for local testing
    DRIVE_FOLDER_ID="YOUR_DRIVE_FOLDER_ID"
    SHARED_DRIVE_ID="YOUR_SHARED_DRIVE_ID" # Omit if not using a Shared Drive
    GCS_BUCKET_NAME="YOUR_GCS_BUCKET_NAME"
    GCS_DESTINATION_PREFIX="your-prefix/"
    OAUTH_CLIENT_ID="YOUR_CLIENT_ID"
    OAUTH_CLIENT_SECRET="YOUR_CLIENT_SECRET"
    OAUTH_REFRESH_TOKEN="YOUR_REFRESH_TOKEN"
    ```

2.  **Run the Test**:
    Run the local test script.

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

Run the following command, replacing placeholders. This example shows the best practice of using Secret Manager for sensitive values.

First, create the secrets:
```bash
gcloud secrets create OAUTH_CLIENT_ID --replication-policy="automatic"
gcloud secrets create OAUTH_CLIENT_SECRET --replication-policy="automatic"
gcloud secrets create OAUTH_REFRESH_TOKEN --replication-policy="automatic"
# Now add the secret values (you will be prompted to enter them)
gcloud secrets versions add OAUTH_CLIENT_ID --data-file=-
gcloud secrets versions add OAUTH_CLIENT_SECRET --data-file=-
gcloud secrets versions add OAUTH_REFRESH_TOKEN --data-file=-

**How to enter the secret:**
1. After running the command, your terminal will pause on a new line.
2. Paste the secret value you copied from your `.env` file.
3. Send the "End-of-File" signal:
    - On **macOS** or **Linux**: Press `Ctrl+D`.
    - On **Windows**: Press `Ctrl+Z`, then press `Enter`.
```

Now, deploy the function, linking the secrets to environment variables:
```bash
gcloud functions deploy transferDriveFilesToGCS \
  --runtime nodejs20 \
  --trigger-topic drive-transfer-topic \
  --entry-point transferDriveFilesToGCS \
  --service-account <your-function-service-account-email> \
  --region europe-west2 \
  --timeout 540s \
  --set-env-vars DRIVE_FOLDER_ID='YOUR_DRIVE_FOLDER_ID',GCS_BUCKET_NAME='YOUR_GCS_BUCKET_NAME',GCS_DESTINATION_PREFIX='your-prefix/',SHARED_DRIVE_ID='YOUR_SHARED_DRIVE_ID' \
  --set-secrets OAUTH_CLIENT_ID=OAUTH_CLIENT_ID:latest,OAUTH_CLIENT_SECRET=OAUTH_CLIENT_SECRET:latest,OAUTH_REFRESH_TOKEN=OAUTH_REFRESH_TOKEN:latest
```

## 5. Testing the Deployed Function

After deployment, you should test the function in the cloud to ensure all permissions and environment variables are correctly configured.

1.  **Trigger the function manually** by publishing a message to its Pub/Sub topic:
    ```bash
    gcloud pubsub topics publish drive-transfer-topic --message "Manual test run"
    ```

2.  **View the function's logs** to monitor its execution. You can stream them live from your terminal:
    ```bash
    gcloud functions logs read transferDriveFilesToGCS --region europe-west2 --live
    ```
    Alternatively, view the logs in the Google Cloud Console by navigating to your function's details page.

3.  **Verify the files** have been transferred to your Google Cloud Storage bucket.

If the test is successful, you can proceed to set up the automated schedule.


## 6. Scheduling

Create a Cloud Scheduler job to run the function nightly. This example runs at 2:00 AM daily.

```bash
gcloud scheduler jobs create pubsub nightly-drive-transfer \
  --schedule "0 2 * * *" \
  --topic drive-transfer-topic \
  --message-body "Run" \
  --time-zone "Europe/London"
```

## 6. Grant Scheduler Permissions

The Cloud Scheduler job needs permission to publish messages to your Pub/Sub topic. By default, Cloud Scheduler uses the **App Engine default service account** (<your-project-id>@appspot.gserviceaccount.com). 

Grant this service account the following role:
- **Pub/Sub Publisher** (`roles/pubsub.publisher`): Allows Cloud Scheduler to publish a message to trigger the function.