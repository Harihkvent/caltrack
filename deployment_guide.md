# CalTrack Deployment Guide (100% Free Tier Approach)

This guide documents how to deploy your **CalTrack** FastAPI backend and React Native Expo app completely free of charge.

---

## 1. Cloud Database (Already Setup)
* **Provider**: **Supabase** (Free Tier)
* **Status**: Configured. You have a free Postgres database running with RLS policies enabled.

---

## 2. Deploy FastAPI Backend (Vercel Serverless Free Tier)

**Vercel** offers a free Hobby tier for hosting Serverless Functions, including Python. We use `@vercel/python` to deploy the FastAPI backend serverlessly.

> [!TIP]
> Vercel's serverless endpoints start up almost instantly (under 1–2 seconds cold start) and do not spin down like Render. This makes it an exceptionally responsive free-tier backend option for a mobile app!

### Steps to Deploy on Vercel:
1. Push your code to a public or private **GitHub** repository.
2. Sign up or log in at [Vercel.com](https://vercel.com) using your GitHub account.
3. Click **Add New** -> **Project**.
4. Import your GitHub repository.
5. In the project configure settings:
   * **Framework Preset**: Choose **Other**.
   * **Root Directory**: Select `backend` (click **Edit** next to Root Directory and navigate to `/backend` directory).
6. Expand the **Environment Variables** section and add the variables from `backend/.env`:
   * `DATABASE_URL` = `postgresql://postgres...` (use your Supabase **Transaction Pooler** link on port `6543` to avoid connection exhaustion in serverless lambdas)
   * `SUPABASE_URL` = `https://nbeqaqypmjbmmzbrcwqo.supabase.co`
   * `SUPABASE_JWKS_URL` = `https://nbeqaqypmjbmmzbrcwqo.supabase.co/auth/v1/.well-known/jwks.json`
   * `SUPABASE_JWT_AUDIENCE` = `authenticated`
   * `GEMINI_API_KEY` = `YOUR_GEMINI_KEY`
   * `GEMINI_MODEL` = `gemini-2.5-flash-lite`
7. Click **Deploy**. Vercel will build the Python dependencies and deploy serverlessly using the configuration in [vercel.json](file:///d:/caltrack/backend/vercel.json).
8. Once finished, copy the deployment URL (e.g., `https://caltrack-backend.vercel.app`).

---

## 3. Update the Mobile App URL

1. In your project codebase, open `app/.env`.
2. Update the environment variable with your production backend URL:
   ```env
   EXPO_PUBLIC_API_URL=https://caltrack-backend.vercel.app
   ```
3. Commit and push this change to GitHub.

---

## 4. Build the Mobile App (Expo EAS Free Tier)

Expo Application Services (EAS) offers a **Free Tier** allowing up to **30 free builds per month** for Android and iOS.

### Steps to Build:
1. Open your terminal in the `app/` folder.
2. Install the EAS command-line interface globally:
   ```bash
   npm install -g eas-cli
   ```
3. Log in or create a free account at [Expo.dev](https://expo.dev):
   ```bash
   eas login
   ```
4. Configure EAS builds for your project:
   ```bash
   eas build:configure
   ```
   *(Select **All** or **Android** when prompted. This creates an `eas.json` configuration file).*

5. To generate a standard installable `.apk` file for Android, modify the generated `eas.json` file in your `app` directory to include an APK build profile:
   ```json
   {
     "cli": {
       "version": ">= 9.0.0"
     },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal",
         "android": {
           "buildType": "apk"
         }
       },
       "production": {}
     },
     "submit": {
       "production": {}
     }
   }
   ```

6. Start the cloud build process for free:
   ```bash
   eas build -p android --profile preview
   ```
7. When the build completes, Expo will output a QR code in the terminal and a download link.
8. Scan the QR code with your Android phone to download and install the **CalTrack app** directly on your device!
