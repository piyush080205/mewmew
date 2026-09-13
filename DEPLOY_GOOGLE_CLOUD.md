# Deploying Nirbhay Backend to Google Cloud

This guide walks you through deploying the FastAPI backend to **Google Cloud Run** from scratch.
No prior Google Cloud experience needed.

---

## What You Will End Up With

- A live backend URL like `https://nirbhay-backend-xxxx-el.a.run.app`
- Auto-scaling (handles 0 to many users, you only pay for requests made)
- All secrets (API keys) stored securely, never in code

---

## Prerequisites

You need these installed on your computer before starting:

| Tool | What it is | Install link |
|------|-----------|--------------|
| Docker Desktop | Builds and runs containers | https://www.docker.com/products/docker-desktop |
| Google Cloud CLI (`gcloud`) | Controls Google Cloud from terminal | https://cloud.google.com/sdk/docs/install |
| Git | Already installed (you have a repo) | — |

After installing Docker Desktop, open it and leave it running in the background.

After installing `gcloud`, open a terminal and run:
```bash
gcloud --version
```
If it prints a version number, you are good.

---

## Step 1: Create a Google Cloud Account and Project

1. Go to https://console.cloud.google.com
2. Sign in with your Google account
3. Click **Select a project** at the top → **New Project**
4. Name it `nirbhay` and click **Create**
5. Wait ~30 seconds, then select the project from the dropdown

> Google gives you $300 free credits for 90 days. Cloud Run is also free for the first 2 million requests per month.

---

## Step 2: Find Your Project ID

Your Project ID is shown in the Google Cloud Console under the project name. It looks like `nirbhay-123456`.

Save it — you will use it in every command below. Replace `YOUR_PROJECT_ID` in all commands with it.

---

## Step 3: Log In via Terminal

Open a terminal (Command Prompt or PowerShell on Windows) and run:

```bash
gcloud auth login
```

A browser window will open. Sign in with your Google account and allow access.

Then set your project:
```bash
gcloud config set project YOUR_PROJECT_ID
```

---

## Step 4: Enable the Required APIs

Google Cloud features are disabled by default. Run this once to turn on what you need:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com containerregistry.googleapis.com
```

This takes about 1 minute.

---

## Step 5: Store Your Secrets Securely

Never put API keys in your code or Docker image. Google Secret Manager stores them safely.

Run each command below, replacing `your-actual-value` with the real key:

```bash
echo -n "your-actual-value" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "your-actual-value" | gcloud secrets create SUPABASE_SECRET_KEY --data-file=-
echo -n "your-actual-value" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "your-actual-value" | gcloud secrets create FAST2SMS_API_KEY --data-file=-
echo -n "your-actual-value" | gcloud secrets create UNWIRED_LABS_API_KEY --data-file=-
```

To find your actual values, check your local `backend/.env` file.

Verify the secrets were saved:
```bash
gcloud secrets list
```

You should see all 5 secrets listed.

---

## Step 6: Give Cloud Build Permission to Access Secrets

Cloud Build runs your deployment. It needs permission to read secrets.

First, find your Cloud Build service account number:
```bash
gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)"
```

This prints a number like `123456789012`. Use it in the next command:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:123456789012@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Also give it permission to deploy to Cloud Run:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:123456789012@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:123456789012@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

---

## Step 7: Deploy

Navigate to the root of your project in the terminal (where `cloudbuild.yaml` is):

```bash
cd C:\Users\wwwpi\Desktop\Nirbhay\nirbhay1
```

Then run the deployment:
```bash
gcloud builds submit --config cloudbuild.yaml --project YOUR_PROJECT_ID
```

This will:
1. Upload your `backend/` folder to Google Cloud
2. Build the Docker image
3. Push it to Google's container registry
4. Deploy it to Cloud Run

It takes about **3–5 minutes** the first time.

---

## Step 8: Get Your Live URL

After deployment finishes, run:
```bash
gcloud run services describe nirbhay-backend --region=asia-south1 --format="value(status.url)"
```

It will print something like:
```
https://nirbhay-backend-abc123-el.a.run.app
```

Open that URL in your browser. You should see:
```json
{"message": "Nirbhay Safety API - Autonomous Women Safety System"}
```

To test the health endpoint:
```
https://nirbhay-backend-abc123-el.a.run.app/api/health
```

---

## Step 9: Update the Frontend API URL

Open `frontend/` and find where the backend URL is configured. Update it to your new Cloud Run URL.

---

## Setting Up Auto-Deploy (Optional but Recommended)

With this setup, every time you push code to GitHub, it will automatically redeploy.

1. Go to https://console.cloud.google.com
2. Search for **Cloud Build** in the top search bar
3. Click **Triggers** → **Create Trigger**
4. Connect your GitHub repository
5. Set:
   - Event: **Push to branch**
   - Branch: `main`
   - Configuration: **Cloud Build configuration file** → `cloudbuild.yaml`
6. Click **Create**

Now every `git push origin main` auto-deploys the backend.

---

## Redeploying Manually After Code Changes

If you change backend code and want to redeploy without setting up auto-deploy:

```bash
gcloud builds submit --config cloudbuild.yaml --project YOUR_PROJECT_ID
```

Same command as Step 7. Run it from the project root.

---

## Updating a Secret

If an API key changes:
```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

Then redeploy so Cloud Run picks up the new value.

---

## Viewing Logs (for debugging)

```bash
gcloud run services logs read nirbhay-backend --region=asia-south1 --limit=50
```

Or in the browser:
1. Go to https://console.cloud.google.com
2. Search **Cloud Run**
3. Click `nirbhay-backend` → **Logs** tab

---

## Stopping / Deleting the Service

To stop all traffic (service still exists, no charges):
```bash
gcloud run services update nirbhay-backend --region=asia-south1 --no-traffic
```

To delete completely:
```bash
gcloud run services delete nirbhay-backend --region=asia-south1
```

---

## Cost Estimate

Cloud Run pricing for a small app like this:

| Usage | Cost |
|-------|------|
| First 2M requests/month | Free |
| 360,000 GB-seconds compute/month | Free |
| Beyond free tier | ~$0.40 per million requests |

For a development/demo app, **you will likely pay nothing**.

---

## Summary Checklist

- [ ] Docker Desktop installed and running
- [ ] `gcloud` CLI installed
- [ ] Google Cloud project created
- [ ] `gcloud auth login` done
- [ ] APIs enabled
- [ ] 5 secrets stored in Secret Manager
- [ ] Permissions granted to Cloud Build
- [ ] `gcloud builds submit` ran successfully
- [ ] Live URL tested in browser
- [ ] Frontend API URL updated
