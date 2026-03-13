# Google Cloud OAuth 2.0 Setup for Conexo

Step-by-step instructions to create a Google OAuth Client ID for local development.

**Time required**: ~5 minutes

---

## Step 1: Go to Google Cloud Console

Open https://console.cloud.google.com/

Sign in with your Google account.

## Step 2: Create a project (or select existing)

1. Click the project dropdown at the top of the page (next to "Google Cloud").
2. Click **New Project**.
3. Name it `Conexo` (or whatever you like).
4. Click **Create**.
5. Make sure the new project is selected in the dropdown.

## Step 3: Enable the OAuth consent screen

1. In the left sidebar, go to **APIs & Services** → **OAuth consent screen**.
   - Direct link: https://console.cloud.google.com/apis/credentials/consent
2. Choose **External** (allows any Google account to sign in).
3. Click **Create**.
4. Fill in the required fields:
   - **App name**: `Conexo`
   - **User support email**: your email
   - **Developer contact email**: your email
5. Click **Save and Continue**.
6. **Scopes** page: click **Add or Remove Scopes**.
   - Select `.../auth/userinfo.email` and `.../auth/userinfo.profile`
   - Click **Update**, then **Save and Continue**.
7. **Test users** page: click **Add Users**.
   - Add your own Google email address.
   - Click **Save and Continue**.
8. Click **Back to Dashboard**.

> **Note**: While in "Testing" status, only the test users you added can sign in.
> Once you're ready for others, you can publish the app to remove this restriction.

## Step 4: Create OAuth Client ID credentials

1. In the left sidebar, go to **APIs & Services** → **Credentials**.
   - Direct link: https://console.cloud.google.com/apis/credentials
2. Click **+ Create Credentials** → **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. **Name**: `Conexo Web Client` (or whatever you like).
5. Under **Authorized JavaScript origins**, click **Add URI** and enter:
   ```
   http://localhost:5173
   ```
6. Under **Authorized redirect URIs**, click **Add URI** and enter:
   ```
   http://localhost:5173
   ```
7. Click **Create**.

## Step 5: Copy your Client ID

After creation, a dialog will show your:
- **Client ID**: something like `123456789-abcdef.apps.googleusercontent.com`
- **Client Secret**: (not needed for this app — we use the ID token flow)

Copy the **Client ID**.

## Step 6: Configure Conexo

Open the `.env` file in the Conexo project root and replace the placeholder:

```bash
CONEXO_GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
```

This same value needs to be available to the frontend. When starting the frontend dev server:

```bash
cd frontend
VITE_GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com npm run dev
```

Or add it to `frontend/.env.local`:

```bash
VITE_GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
```

## How it works

1. User clicks "Sign in with Google" on the frontend.
2. Google shows the consent screen and returns an **ID token** to the frontend.
3. Frontend sends the ID token to `POST /api/auth/google`.
4. Backend verifies the token with Google's servers using the Client ID.
5. Backend creates (or finds) the user and returns a Conexo JWT.
6. Frontend stores the JWT and uses it for all subsequent API requests.

No client secret is needed because we use Google's "Sign In with Google" button
which uses the ID token (implicit) flow, not the authorization code flow.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "The given origin is not allowed for the given client ID" | Make sure `http://localhost:5173` is in **Authorized JavaScript origins** |
| "Access blocked: This app's request is invalid" | Check that the OAuth consent screen is configured |
| "idpiframe_initialization_failed" | Clear browser cookies/cache, or try incognito |
| Sign-in button doesn't appear | Check browser console for errors. Verify `VITE_GOOGLE_CLIENT_ID` is set. |
| "Token used too late" | Your system clock may be off. Check date/time settings. |
| Backend returns 401 after sign-in | Make sure `CONEXO_GOOGLE_CLIENT_ID` in `.env` matches the frontend value exactly |

## For production deployment

When deploying to a real domain:
1. Add your production domain to **Authorized JavaScript origins** (e.g., `https://conexo.example.com`).
2. Add your production domain to **Authorized redirect URIs**.
3. Publish the OAuth consent screen (removes test-user restriction).
4. Update `CONEXO_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in your production environment.
