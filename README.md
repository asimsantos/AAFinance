# A&A Finance — Local Setup

## First time setup

1. Open Terminal (Cmd + Space → Terminal)
2. Drag the `aa-finance` folder into Terminal, type `cd ` then drag the folder, press Enter
3. Run: `chmod +x start.sh && ./start.sh`
4. Open Chrome and go to: **http://localhost:5173**

## Every day after that

1. Open Terminal
2. `cd` into the aa-finance folder  
3. Run: `./start.sh`
4. Open **http://localhost:5173**

## Your data

- Stored in `data/finance.db` (SQLite database)
- **Back up this file** — it contains all your transactions
- To restore: just copy `finance.db` back into the `data/` folder

## Keyboard shortcut (optional)

Create a one-click launcher on Mac:
1. Open Automator → New Document → Application
2. Add "Run Shell Script" action
3. Paste: `cd /path/to/aa-finance && ./start.sh`
4. Save as "AA Finance" to your Desktop
5. Double-click to launch the app
