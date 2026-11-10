# Backend database setup

Open **Visual Studio → View → Terminal** in the repository root. With SQL Server Express running locally, run:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -b -i backend\sql\init.sql
```

This creates the `Fuel_Station` database and its empty project tables, including `AuthUsers`, `AuthSessions`, and `AuthPasswordResets`. It is safe to rerun because the script skips databases and tables that already exist. Run it again after pulling this password recovery update. If your terminal is already in the `backend` folder, use `-i sql\init.sql` instead.

Each teammate must have SQL Server and `sqlcmd` installed locally. Copy `.env.example` to `.env` in this folder and set `DB_AUTH=windows`, `DB_HOST=.\SQLEXPRESS`, `DB_PORT=` (blank), and `DB_NAME=Fuel_Station`. Keep `.env` out of Git. Use the project's `sql/init.sql` script rather than NuGet's `Update-Database`, which is for Entity Framework projects.

Install dependencies with `python -m pip install -r requirements.txt`, then start `python -m uvicorn app.main:app --reload --port 8000` from this folder. On a new database the first signup creates the Admin account; thereafter an Admin creates accounts in Users & Roles. For an HTTPS deployment, set `AUTH_COOKIE_SECURE=true` in `.env`.

If you forgot the password for an existing local account, open a second terminal in `backend/` and run `python reset_password.py`. Enter the account email and a new password when prompted. The password is hidden while you type, and the reset signs out existing sessions for that account. This command needs access to the same local SQL Server database as the backend.

For the **Forgot password?** link to email reset links, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` (`starttls` or `ssl`), `SMTP_FROM`, `SMTP_USERNAME`, and `SMTP_PASSWORD` in the private `backend/.env`. Set `FRONTEND_PUBLIC_URL` to the URL where teammates open the frontend (for example `http://localhost:5173` for one computer). Use your mail provider's SMTP credentials or app password; do not commit them. Restart FastAPI after changing `.env`. Without SMTP configuration, the endpoint reports that email recovery is unavailable and the local terminal reset command remains usable. Reset links expire after 30 minutes, work only once, and revoke previous sessions when used. A request for an unknown email receives the same response as a known email.
# Role migration

Run `sql/init.sql` against the existing `Fuel_Station` database before restarting the API. It adds `Role`, `DriverId`, and `IsActive` to `AuthUsers` without dropping existing records. Existing users receive the Admin role to preserve their access; an administrator should review and reassign them in Users & Roles. The first signup on an empty installation creates the initial Admin. Further accounts must be created by an Admin in the application. Driver accounts require an existing driver profile and one account per driver.

The same idempotent script now extends `LovesLocations` with station details and creates `FleetAlerts`, `AlertPreferences`, and `AssistantMessages`. Run it again before using Fuel Stops, Alerts, or the AI Assistant. To enable AI, set `OPENAI_API_KEY` and `OPENAI_MODEL` in the private `backend/.env` and restart FastAPI. The assistant sends only role-authorized, bounded database summaries to the configured OpenAI model. Without these settings, chat returns a clear configuration error; existing fleet features continue to work.
