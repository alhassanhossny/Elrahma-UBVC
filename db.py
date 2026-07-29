# -*- coding: utf-8 -*-
import sqlite3
import os
import sys

# Force UTF-8 encoding for all I/O on Windows
if sys.version_info[0] >= 3:
    import io
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass
    else:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bvc_alrahma.db')

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Employees Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            employee_code TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            national_id TEXT DEFAULT '',
            pay_type TEXT NOT NULL, -- 'hourly' or 'shift'
            rate REAL NOT NULL, -- EGP per hour or per shift
            default_shift TEXT DEFAULT 'morning', -- 'morning' or 'evening'
            status TEXT DEFAULT 'active', -- 'active' or 'inactive'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            monthly_incentive REAL DEFAULT 0,
            daily_rate REAL DEFAULT 0,
            shift_start_time TEXT DEFAULT '',
            shift_end_time TEXT DEFAULT ''
        )
    ''')
    
    # Migration: add employee_code and phone columns if missing (for existing databases)
    try:
        cursor.execute("SELECT employee_code FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN employee_code TEXT DEFAULT ''")
    try:
        cursor.execute("SELECT phone FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN phone TEXT DEFAULT ''")
    try:
        cursor.execute("SELECT national_id FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN national_id TEXT DEFAULT ''")
    try:
        cursor.execute("SELECT monthly_incentive FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN monthly_incentive REAL DEFAULT 0")
    try:
        cursor.execute("SELECT daily_rate FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN daily_rate REAL DEFAULT 0")
    try:
        cursor.execute("SELECT shift_start_time FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN shift_start_time TEXT DEFAULT ''")
    try:
        cursor.execute("SELECT shift_end_time FROM employees LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE employees ADD COLUMN shift_end_time TEXT DEFAULT ''")
    
    # Create unique index on national_id (partial: only non-empty values)
    try:
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_national_id ON employees(national_id) WHERE national_id != ''")
    except sqlite3.OperationalError:
        pass

    # Backfill employee_code for any existing employees that are missing one
    rows = cursor.execute("SELECT id FROM employees WHERE employee_code IS NULL OR employee_code = '' ORDER BY id ASC").fetchall()
    for idx, row in enumerate(rows):
        code = 'EMP-' + str(idx + 1).zfill(3)
        cursor.execute("UPDATE employees SET employee_code = ? WHERE id = ?", (code, row[0]))
    if rows:
        print(f"Backfilled employee codes for {len(rows)} employees")
    
    # 2. Attendance Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            date TEXT NOT NULL, -- YYYY-MM-DD
            shift TEXT NOT NULL, -- 'morning' or 'evening'
            check_in TEXT NOT NULL, -- HH:MM
            check_out TEXT NOT NULL, -- HH:MM
            hours_worked REAL NOT NULL,
            overtime_hours REAL DEFAULT 0.0,
            notes TEXT,
            is_late INTEGER DEFAULT 0,
            late_minutes INTEGER DEFAULT 0,
            excuse TEXT DEFAULT '',
            deduction_hours REAL DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
        )
    ''')
    
    # Indexes (must be created AFTER all referenced tables exist)
    try:
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique_emp_date_shift ON attendance(employee_id, date, shift)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_payroll_emp_dates ON payroll(employee_id, start_date, end_date)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_emp_payroll ON transactions(employee_id, payroll_id)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_emp_date ON transactions(employee_id, date)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cashbox_date ON cashbox(date)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_employee_ledger_emp ON employee_ledger(employee_id, date)")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode)")
    except sqlite3.OperationalError:
        pass

    # 3. Payroll Records Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payroll (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            start_date TEXT NOT NULL, -- YYYY-MM-DD
            end_date TEXT NOT NULL, -- YYYY-MM-DD
            total_hours REAL DEFAULT 0.0,
            total_shifts INTEGER DEFAULT 0,
            base_salary REAL NOT NULL,
            total_bonuses REAL DEFAULT 0.0,
            total_deductions REAL DEFAULT 0.0,
            total_loans_deducted REAL DEFAULT 0.0,
            net_salary REAL NOT NULL,
            issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
        )
    ''')
    
    # 4. Financial Transactions Table (Loans, Bonuses, Deductions)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'loan' (سلفة), 'bonus' (مكافأة), 'deduction' (خصم)
            amount REAL NOT NULL,
            date TEXT NOT NULL, -- YYYY-MM-DD
            description TEXT,
            payroll_id INTEGER, -- Link to payroll when settled
            FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
            FOREIGN KEY (payroll_id) REFERENCES payroll (id) ON DELETE SET NULL
        )
    ''')
    
    # 5. Inventory Table (Stock)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL,
            item_code TEXT UNIQUE NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            unit TEXT NOT NULL, -- 'قطعة', 'كرتونة', 'علبة', etc.
            purchase_price REAL NOT NULL DEFAULT 0.0,
            sale_price REAL NOT NULL DEFAULT 0.0,
            min_stock INTEGER NOT NULL DEFAULT 5, -- Alert limit
            description TEXT,
            wholesale_price REAL DEFAULT 0, -- سعر القطاعي
            market_price REAL DEFAULT 0, -- سعر السوق
            last_purchase_price REAL DEFAULT 0, -- آخر سعر شراء
            avg_purchase_price REAL DEFAULT 0, -- متوسط سعر شراء
            min_retail_price REAL DEFAULT 0, -- أقل سعر قطاعي
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Migration: add inventory price columns + barcode
    for col, typ, default in [
        ('wholesale_price', 'REAL', 0), ('market_price', 'REAL', 0),
        ('last_purchase_price', 'REAL', 0), ('avg_purchase_price', 'REAL', 0),
        ('min_retail_price', 'REAL', 0),
    ]:
        try:
            cursor.execute(f"SELECT {col} FROM inventory LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute(f"ALTER TABLE inventory ADD COLUMN {col} {typ} DEFAULT {default}")
    try:
        cursor.execute("SELECT barcode FROM inventory LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE inventory ADD COLUMN barcode TEXT DEFAULT ''")
    
    # 6. Cashbox (Treasury) Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cashbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT NOT NULL, -- 'deposit' or 'withdrawal'
            amount REAL NOT NULL,
            source TEXT DEFAULT '', -- 'أبورحمه' or description
            description TEXT DEFAULT '',
            category TEXT DEFAULT '', -- for expenses: 'رواتب', 'مصاريف مصنع', 'وقود', etc.
            related_employee_id INTEGER,
            balance_after REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (related_employee_id) REFERENCES employees (id) ON DELETE SET NULL
        )
    ''')
    
    # 7. Factory Expenses Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS factory_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            cashbox_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cashbox_id) REFERENCES cashbox (id) ON DELETE SET NULL
        )
    ''')
    
    # 8. Employee Ledger Table (running balance per employee)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employee_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type TEXT NOT NULL, -- 'salary_earned', 'withdrawal', 'debt_add', 'debt_repayment', 'deduction', 'bonus', 'monthly_incentive'
            amount REAL NOT NULL, -- positive = credit to employee, negative = debit from employee
            description TEXT DEFAULT '',
            payroll_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
            FOREIGN KEY (payroll_id) REFERENCES payroll (id) ON DELETE SET NULL
        )
    ''')
    
    # 9. System Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT DEFAULT '',
            role TEXT DEFAULT 'user', -- 'admin' or 'user'
            is_active INTEGER DEFAULT 1,
            permissions TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    ''')
    
    # Migration: add permissions column if missing
    try:
        cursor.execute("SELECT permissions FROM system_users LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE system_users ADD COLUMN permissions TEXT DEFAULT NULL")
    
    # 10. System Settings Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Seed default settings if empty
    settings_count = cursor.execute("SELECT COUNT(*) FROM system_settings").fetchone()[0]
    if settings_count == 0:
        defaults = [
            ('morning_shift_start', '08:00'),
            ('morning_shift_end', '16:00'),
            ('evening_shift_start', '16:00'),
            ('evening_shift_end', '00:00'),
            ('overtime_threshold_hours', '8'),
            ('company_name', 'شركة الرحمه'),
        ]
        for k, v in defaults:
            cursor.execute("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)", (k, v))
    
    # Seed default admin user if none exists
    user_count = cursor.execute("SELECT COUNT(*) FROM system_users").fetchone()[0]
    if user_count == 0:
        import hashlib, secrets
        salt = secrets.token_hex(16)
        pw_hash = hashlib.sha256((salt + 'admin123').encode('utf-8')).hexdigest()
        cursor.execute(
            "INSERT INTO system_users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
            ('admin', salt + ':' + pw_hash, 'المدير', 'admin')
        )
        print("Default admin user created: admin / admin123")

    # 11. Shifts Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL
        )
    ''')

    # Seed default shifts if empty
    shift_count = cursor.execute("SELECT COUNT(*) FROM shifts").fetchone()[0]
    if shift_count == 0:
        cursor.execute("INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)", ('صباحي', '08:00', '16:00'))
        cursor.execute("INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)", ('مسائي', '16:00', '00:00'))

    # Migrate existing employee default_shift and attendance shift from text to ID strings
    cursor.execute("UPDATE employees SET default_shift='1' WHERE default_shift='morning'")
    cursor.execute("UPDATE employees SET default_shift='2' WHERE default_shift='evening'")
    cursor.execute("UPDATE attendance SET shift='1' WHERE shift='morning'")
    cursor.execute("UPDATE attendance SET shift='2' WHERE shift='evening'")

    conn.commit()
    conn.close()

# Helper functions for database access
_db_conn = None
_db_conn_lock = 0
_transaction_depth = 0

def get_conn():
    global _db_conn
    if _db_conn is None:
        _db_conn = get_db_connection()
    else:
        try:
            _db_conn.execute("SELECT 1")
        except sqlite3.Error:
            try:
                _db_conn.close()
            except Exception:
                pass
            _db_conn = get_db_connection()
    return _db_conn

def begin_transaction():
    global _transaction_depth
    if _transaction_depth == 0:
        conn = get_conn()
        conn.execute("BEGIN IMMEDIATE")
    _transaction_depth += 1

def commit_transaction():
    global _transaction_depth
    _transaction_depth -= 1
    if _transaction_depth <= 0:
        _transaction_depth = 0
        conn = get_conn()
        conn.commit()

def rollback_transaction():
    global _transaction_depth
    if _transaction_depth > 0:
        _transaction_depth = 0
        conn = get_conn()
        conn.rollback()

def query_db(query, args=(), one=False):
    conn = get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(query, args)
        rv = cursor.fetchall()
        return (rv[0] if rv else None) if one else rv
    finally:
        pass

def execute_db(query, args=()):
    conn = get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(query, args)
        last_id = cursor.lastrowid
        rowcount = cursor.rowcount
        conn.commit()
        return last_id
    except Exception as e:
        conn.rollback()
        raise
    finally:
        pass

def execute_db_many(queries_args):
    conn = get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        last_ids = []
        for query, args in queries_args:
            cursor.execute(query, args)
            last_ids.append(cursor.lastrowid)
        conn.commit()
        return last_ids
    except Exception as e:
        conn.rollback()
        raise
    finally:
        pass

def import_items_from_xml(xml_path):
    """Import items from the XML-based inventory file into inventory table."""
    import xml.etree.ElementTree as ET
    ns = {'ss': 'urn:schemas-microsoft-com:office:spreadsheet'}
    
    try:
        tree = ET.parse(xml_path)
    except Exception as e:
        print(f"Failed to parse XML: {e}")
        return 0
    
    root = tree.getroot()
    conn = get_db_connection()
    cursor = conn.cursor()
    count = 0
    
    for sheet in root.findall('.//ss:Worksheet', ns):
        for row in sheet.findall('.//ss:Row', ns):
            grid = {}
            col = 1
            for cell in row.findall('ss:Cell', ns):
                explicit_idx = cell.attrib.get('{urn:schemas-microsoft-com:office:spreadsheet}Index')
                if explicit_idx:
                    col = int(explicit_idx)
                merge = cell.attrib.get('{urn:schemas-microsoft-com:office:spreadsheet}MergeAcross', '0')
                merge_across = int(merge) if merge else 0
                data_el = cell.find('ss:Data', ns)
                val = data_el.text.strip() if data_el is not None and data_el.text else ''
                grid[col] = val
                col += 1 + merge_across
            
            item_code = grid.get(32, '').strip()
            item_name = grid.get(30, '').strip()
            unit = grid.get(28, '').strip()
            wholesale = grid.get(17, '')
            last_p = grid.get(8, '')
            avg_p = grid.get(11, '')
            market = grid.get(1, '')
            min_retail = grid.get(15, '')
            
            if not item_name or not item_code or item_code == 'رقم الصنف':
                continue
            
            def to_float(s):
                try:
                    return float(s) if s else 0.0
                except (ValueError, TypeError):
                    return 0.0
            
            wholesale_f = to_float(wholesale)
            last_p_f = to_float(last_p)
            avg_p_f = to_float(avg_p)
            market_f = to_float(market)
            min_retail_f = to_float(min_retail)
            
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO inventory (item_name, item_code, quantity, unit, purchase_price, sale_price, min_stock, description, wholesale_price, market_price, last_purchase_price, avg_purchase_price, min_retail_price)
                    VALUES (?, ?, 0, ?, ?, ?, 5, '', ?, ?, ?, ?, ?)
                ''', (item_name, item_code, unit, last_p_f, wholesale_f, wholesale_f, market_f, last_p_f, avg_p_f, min_retail_f))
                if cursor.rowcount > 0:
                    count += 1
            except Exception:
                pass
    
    conn.commit()
    conn.close()
    print(f"Imported {count} items from {xml_path}")
    return count


if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at:", DATABASE_PATH)
