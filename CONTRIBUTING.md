# Working together

The GitHub repository is `https://github.com/salmanj109/OCR-Based-Fuel-Management-System` and its default branch is `ORC_Main`. Use this branch as the base for new work. The older local `main` branch is not the team's default branch.

## Access

Anyone can clone the public repository. To push a branch, each teammate needs a GitHub account with write access. The repository owner must invite the two teammates by their exact GitHub usernames through **Repository Settings → Collaborators → Add people**. Each teammate must accept the invitation before pushing. A local Git author name or email does not grant GitHub access.

## Clone once

```powershell
git clone https://github.com/salmanj109/OCR-Based-Fuel-Management-System.git
cd OCR-Based-Fuel-Management-System
git branch --show-current
git remote -v
```

The branch should be `ORC_Main`, and `origin` should point to `salmanj109`. Do not run `git init` in the clone or change `origin` to the former owner's repository. In Visual Studio, open the cloned repository folder with **File → Open → Folder** so both `frontend/` and `backend/` are visible.

## Install locally

From the repository root, install the backend in its own Python environment:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
cd ..
```

Configure each person's `backend/.env` locally if SQL Server is available. Never commit real `.env` files or credentials. The API `/health` endpoint works without a database connection.

Install the frontend separately:

```powershell
cd frontend
npm ci
cd ..
```

Use the run commands in `README.md`. The root `requirements.txt`, root Python files, and Docker configuration are for the preserved legacy application.

## Make changes without overwriting a teammate's work

Each person creates a different branch for each change. Replace `your-name/task-name` with a unique name:

```powershell
git switch ORC_Main
git pull --ff-only origin ORC_Main
git switch -c work/your-name/task-name
# Edit files, then review and commit your changes.
git status
git add <files-you-changed>
git commit -m "Describe the change"
git push -u origin work/your-name/task-name
```

Open a pull request on GitHub from your branch into `ORC_Main`. Ask a teammate to review it, then merge it. Before starting the next task, switch back to `ORC_Main` and pull again. Do not have all three people push directly to the same branch; Git will reject a push when the remote branch has newer commits, and simultaneous edits can cause merge conflicts. If a push is rejected, fetch or pull the latest changes and resolve conflicts rather than using `--force`.

In Visual Studio, the same workflow is: **Git → New Branch** from `ORC_Main`, make and commit changes in **Git Changes**, choose **Push** or **Publish Branch**, then open a pull request on GitHub targeting `ORC_Main`. After the pull request is merged, switch back to `ORC_Main` and choose **Pull** before starting another change.

Before a pull request, run `npm run build` from `frontend/` and `python -m unittest discover -s tests -v` from `backend/` for the files that are available locally. SQL Server connectivity needs a configured database and is not required for the offline tests.
