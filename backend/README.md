# Backend database setup

Open **Visual Studio → View → Terminal** in the repository root. With SQL Server Express running locally, run:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -b -i backend\sql\init.sql
```

This creates the `Fuel_Station` database and its empty project tables. It is safe to rerun because the script skips databases and tables that already exist. If your terminal is already in the `backend` folder, use `-i sql\init.sql` instead.

Each teammate must have SQL Server and `sqlcmd` installed locally. Copy `.env.example` to `.env` in this folder and set `DB_AUTH=windows`, `DB_HOST=.\SQLEXPRESS`, `DB_PORT=` (blank), and `DB_NAME=Fuel_Station`. Keep `.env` out of Git. Use the project's `sql/init.sql` script rather than NuGet's `Update-Database`, which is for Entity Framework projects.
