# BVC Al-Rahma (بى فى سى الرحمة)

Integrated management system for BVC Al-Rahma — employee, attendance, payroll, inventory, treasury, and shift management.

## Features

- **Employee Management** — add, edit, delete employees; hourly/monthly pay types; active/inactive status
- **Attendance** — daily check-in/check-out, fast-check modal with searchable employee dropdown
- **Loans & Transactions** — track employee loans and financial transactions
- **Payroll** — calculate salaries with overtime, export to Excel
- **Inventory** — stock tracking, min-stock alerts, import/export Excel
- **Treasury** — deposits/withdrawals tracking
- **Shift Management** — dynamic add/delete shifts (صباحي/مسائي/ليلي)
- **User Authentication & Permissions** — login overlay, role-based access control
- **Backup & Restore** — create/restore/list database backups
- **Settings** — configurable overtime threshold, company name
- **Excel Import** — batch import employees from Excel files
- **Arabic RTL UI** — full right-to-left Arabic interface with Tajawal font

## Requirements

- Python 3.x (embedded `python_embed/` included)
- No external dependencies (uses Python standard library only)

## Quick Start

1. Run `server.py`:
   ```
   python server.py
   ```
2. Open `http://localhost:8000` in a browser
3. Login with: **admin** / **admin123**

The server runs on port 8000 and uses SQLite (`bvc_alrahma.db`) for storage.

## Default Credentials

- Username: `admin`
- Password: `admin123`

## Project Structure

```
server.py          — HTTP server with JSON API
db.py              — SQLite database utilities
import_data.py     — Excel/CSV data import
public/
  index.html       — Main UI (Arabic RTL)
  app.js           — Frontend logic
  style.css        — Styles + Tajawal font
```

## License

Private — BVC Al-Rahma
