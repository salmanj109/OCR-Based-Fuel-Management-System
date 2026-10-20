# Backend database setup

Open **Visual Studio → View → Terminal** in the repository root. With SQL Server Express running locally, run:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -b -i backend\sql\init.sql
```

This creates the `Fuel_Station` database and its empty project tables, including `AuthUsers`, `AuthSessions`, and `AuthPasswordResets`. It is safe to rerun because the script skips databases and tables that already exist. Run it again after pulling this password recovery update. If your terminal is already in the `backend` folder, use `-i sql\init.sql` instead.

Each teammate must have SQL Server and `sqlcmd` installed locally. Copy `.env.example` to `.env` in this folder and set `DB_AUTH=windows`, `DB_HOST=.\SQLEXPRESS`, `DB_PORT=` (blank), and `DB_NAME=Fuel_Station`. Keep `.env` out of Git. Use the project's `sql/init.sql` script rather than NuGet's `Update-Database`, which is for Entity Framework projects.

Install dependencies with `python -m pip install -r requirements.txt`, then start `python -m uvicorn app.main:app --reload --port 8000` from this folder. Open the frontend and create a separate account for each teammate. Public signup is enabled for this local project; do not expose it to the internet without an invitation or approval policy. For an HTTPS deployment, set `AUTH_COOKIE_SECURE=true` in `.env`.

If you forgot the password for an existing local account, open a second terminal in `backend/` and run `python reset_password.py`. Enter the account email and a new password when prompted. The password is hidden while you type, and the reset signs out existing sessions for that account. This command needs access to the same local SQL Server database as the backend.

For the **Forgot password?** link to email reset links, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` (`starttls` or `ssl`), `SMTP_FROM`, `SMTP_USERNAME`, and `SMTP_PASSWORD` in the private `backend/.env`. Set `FRONTEND_PUBLIC_URL` to the URL where teammates open the frontend (for example `http://localhost:5173` for one computer). Use your mail provider's SMTP credentials or app password; do not commit them. Restart FastAPI after changing `.env`. Without SMTP configuration, the endpoint reports that email recovery is unavailable and the local terminal reset command remains usable. Reset links expire after 30 minutes, work only once, and revoke previous sessions when used. A request for an unknown email receives the same response as a known email.
