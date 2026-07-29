// BVC Al-Rahma Management System Client Logic (ES5 Compatible for IE11/Win7 support)
var API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:8000/api' : '/api';

var app = {
    activeTab: 'dashboard',
    employeesList: [],
    employeeView: 'active',
    currentPayrollData: null,
    _confirmCallback: null,
    loggedInUser: null,
    shifts: [],
    
    // Tab titles and subtitles for Arabic localization
    tabMeta: {
        dashboard: { title: 'لوحة التحكم', subtitle: 'نظرة عامة على حالة العمل والعمليات اليوم' },
        employees: { title: 'إدارة الموظفين', subtitle: 'تسجيل وتحديث بيانات العمال وطريقة حساب أجورهم' },
        attendance: { title: 'الحضور والانصراف', subtitle: 'متابعة وتسجيل ساعات حضور وانصراف العمال بالوردية' },
        finance: { title: 'السلف والمالية', subtitle: 'إدارة السلف، القروض الممنوحة، المكافآت والخصومات' },
        payroll: { title: 'حساب الرواتب الأسبوعية', subtitle: 'معاينة واحتساب الرواتب وتصدير كشف الرواتب المعتمد' },
        inventory: { title: 'مخزن BVC Stock', subtitle: 'إدارة البضائع والقطع المتوفرة ومراقبة النواقص' },
        treasury: { title: 'الخزنة', subtitle: 'إدارة المعاملات المالية الواردة والمصروفات' },
        permissions: { title: 'صلاحيات المستخدمين', subtitle: 'التحكم في صلاحيات الوصول للصفحات' },
        settings: { title: 'الإعدادات', subtitle: 'إدارة المستخدمين والورديات والنسخ الاحتياطي' }
    },

    init: function() {
        var stored = sessionStorage.getItem('bvc_user');
        if (stored) {
            try {
                this.loggedInUser = JSON.parse(stored);
            } catch(e) {
                this.loggedInUser = null;
            }
        }

        this.bindEvents();
        this.setTodayDates();
        this.loadShifts();

        if (this.loggedInUser) {
            this.hideLoginForm();
            this.updateUserDisplay();
            this.applyMenuPermissions();
            this.loadTab(this.activeTab);
            this.showToast('مرحباً بك');
        } else {
            this.showLoginForm();
        }
    },

    showLoginForm: function() {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('form-login').reset();
        document.getElementById('login-error').innerText = '';
    },

    hideLoginForm: function() {
        document.getElementById('login-overlay').style.display = 'none';
    },

    handleLogin: function() {
        var self = this;
        var username = document.getElementById('login-username').value.trim();
        var password = document.getElementById('login-password').value;

        if (!username || !password) {
            document.getElementById('login-error').innerText = 'يرجى إدخال اسم المستخدم وكلمة المرور';
            return;
        }

        this.apiCall(API_BASE + '/auth/login', 'POST', {username: username, password: password}, function(err, result) {
            if (err || !result.success) {
                document.getElementById('login-error').innerText = err ? err.message : 'بيانات الدخول غير صحيحة';
                return;
            }
            self.loggedInUser = result.user;
            sessionStorage.setItem('bvc_user', JSON.stringify(result.user));
            document.getElementById('login-error').innerText = '';
            self.hideLoginForm();
            self.updateUserDisplay();
            self.applyMenuPermissions();
            self.loadTab(self.activeTab);
            self.showToast('مرحباً بك، ' + (result.user.display_name || result.user.username));
        });
    },

    logout: function() {
        this.loggedInUser = null;
        sessionStorage.removeItem('bvc_user');
        this.showLoginForm();
    },

    updateUserDisplay: function() {
        var area = document.getElementById('sidebar-user-area');
        var nameEl = document.getElementById('sidebar-user-name');
        if (this.loggedInUser) {
            area.style.display = 'block';
            nameEl.innerText = (this.loggedInUser.display_name || this.loggedInUser.username);
        } else {
            area.style.display = 'none';
        }
    },

    defaultPermissions: {
        dashboard: true,
        employees: true,
        attendance: true,
        finance: true,
        payroll: true,
        inventory: true,
        treasury: true,
        settings: true
    },

    userHasPermission: function(tab) {
        if (tab === 'dashboard') return true;
        if (!this.loggedInUser) return false;
        if (this.loggedInUser.role === 'admin') return true;
        var perms = this.loggedInUser.permissions || this.defaultPermissions;
        return perms[tab] === true;
    },

    applyMenuPermissions: function() {
        var self = this;
        var items = document.querySelectorAll('.menu-item');
        for (var i = 0; i < items.length; i++) {
            var tab = items[i].getAttribute('data-tab');
            if (tab === 'permissions') {
                items[i].style.display = (self.loggedInUser && self.loggedInUser.role === 'admin') ? 'block' : 'none';
            } else if (!self.userHasPermission(tab)) {
                items[i].style.display = 'none';
            } else {
                items[i].style.display = 'block';
            }
        }
    },

    // XHR helper to replace fetch (100% IE11 compatible)
    apiCall: function(url, method, data, callback) {
        var xhr = new XMLHttpRequest();
        var actualMethod = method || 'GET';
        xhr.open(actualMethod, url, true);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var parsed = JSON.parse(xhr.responseText);
                        callback(null, parsed);
                    } catch (e) {
                        callback(e, null);
                    }
                } else {
                    var errMsg = 'Error';
                    try {
                        var errObj = JSON.parse(xhr.responseText);
                        errMsg = errObj.error || errMsg;
                    } catch(e) {}
                    callback(new Error(errMsg), null);
                }
            }
        };
        xhr.send(data ? JSON.stringify(data) : null);
    },

    // Set default dates for filter inputs
    setTodayDates: function() {
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + 
                       this.padZero(today.getMonth() + 1) + '-' + 
                       this.padZero(today.getDate());
        
        // Last 7 days for attendance
        var lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        var lastWeekStr = lastWeek.getFullYear() + '-' + 
                          this.padZero(lastWeek.getMonth() + 1) + '-' + 
                          this.padZero(lastWeek.getDate());
        
        document.getElementById('today-date-badge').innerText = this.formatArabicDate(today);
        
        // Attendance tab filters
        document.getElementById('attendance-filter-start').value = lastWeekStr;
        document.getElementById('attendance-filter-end').value = todayStr;
        
        // Payroll dates (default to standard 7 days weekly)
        document.getElementById('payroll-start-date').value = lastWeekStr;
        document.getElementById('payroll-end-date').value = todayStr;
        
        // Attendance modal date
        document.getElementById('attendance-date').value = todayStr;
        document.getElementById('transaction-date').value = todayStr;
        document.getElementById('treasury-date').value = todayStr;
        
        // Initialize AM/PM toggle buttons
        this.initTimePickers();
    },

    padZero: function(num) {
        return num < 10 ? '0' + num : num;
    },

    // Event bindings for buttons and modals
    bindEvents: function() {
        var self = this;

        // Login form
        document.getElementById('form-login').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleLogin();
        });

        // Logout button
        document.getElementById('btn-logout').addEventListener('click', function() {
            self.logout();
        });

        // Sidebar navigation
        var menuItems = document.querySelectorAll('.menu-item');
        for (var i = 0; i < menuItems.length; i++) {
            menuItems[i].addEventListener('click', function(e) {
                e.preventDefault();
                var tab = this.getAttribute('data-tab');
                self.switchTab(tab);
            });
        }

        // Quick attendance button in header
        document.getElementById('btn-quick-attendance').addEventListener('click', function() {
            self.openFastCheckModal();
        });

        // Close modal on X, cancel button, or backdrop click
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('close-modal') || e.target.classList.contains('btn-close')) {
                var el = e.target;
                while (el && el !== document.body) {
                    if (el.classList && el.classList.contains('modal')) {
                        el.classList.remove('open');
                        break;
                    }
                    el = el.parentNode;
                }
            }
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('open');
            }
        });

        // 1. Employee tab events
        document.getElementById('btn-add-employee').addEventListener('click', function() {
            self.openEmployeeModal();
        });
        document.getElementById('employee-pay-type').addEventListener('change', function(e) {
            self.toggleRateLabel(e.target.value);
        });
        document.getElementById('form-employee').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleEmployeeSubmit();
        });

        // 2. Attendance tab events
        document.getElementById('btn-log-attendance').addEventListener('click', function() {
            self.openModal('attendance');
        });
        document.getElementById('btn-filter-attendance').addEventListener('click', function() {
            self.loadAttendanceData();
        });
        document.getElementById('form-attendance').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleAttendanceSubmit();
        });

        // 3. Transactions / Finance events
        document.getElementById('btn-add-transaction').addEventListener('click', function() {
            self.openModal('transaction');
        });
        document.getElementById('form-transaction').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleTransactionSubmit();
        });

        // 4. Payroll calculation events
        document.getElementById('btn-calculate-payroll').addEventListener('click', function() {
            self.calculatePayroll();
        });
        document.getElementById('btn-save-payroll').addEventListener('click', function() {
            self.savePayroll();
        });
        document.getElementById('btn-export-payroll').addEventListener('click', function() {
            self.exportPayrollCSV();
        });

        // 5. Inventory tab events
        document.getElementById('btn-add-inventory').addEventListener('click', function() {
            self.openInventoryModal();
        });
        document.getElementById('form-inventory').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleInventorySubmit();
        });
        document.getElementById('btn-filter-inventory').addEventListener('click', function() {
            self.renderInventoryTable();
        });
        document.getElementById('inventory-search').addEventListener('input', function() {
            self.renderInventoryTable();
        });
        document.getElementById('inventory-stock-filter').addEventListener('change', function() {
            self.renderInventoryTable();
        });

        // 6. Fast Check-in/out events
        document.getElementById('form-fast-check').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleFastCheck();
        });
        document.getElementById('fast-check-employee-search').addEventListener('input', function() {
            self._filterFastCheckDropdown(this.value);
        });
        document.getElementById('fast-check-employee-search').addEventListener('focus', function() {
            var dropdown = document.getElementById('fast-check-employee-dropdown');
            if (dropdown.children.length > 0) dropdown.classList.add('open');
        });
        document.getElementById('fast-check-employee-search').addEventListener('blur', function() {
            setTimeout(function() {
                document.getElementById('fast-check-employee-dropdown').classList.remove('open');
            }, 200);
        });

        // 7. Treasury form events
        document.getElementById('form-treasury').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleTreasurySubmit();
        });

        // 7. Custom Confirmation Modal events
        document.getElementById('confirm-cancel-btn').addEventListener('click', function() {
            document.getElementById('modal-confirm').classList.remove('open');
            self._confirmCallback = null;
        });
        document.getElementById('confirm-ok-btn').addEventListener('click', function() {
            document.getElementById('modal-confirm').classList.remove('open');
            if (self._confirmCallback) {
                var cb = self._confirmCallback;
                self._confirmCallback = null;
                cb();
            }
        });

        // 8. Settings tab events
        document.getElementById('btn-add-user').addEventListener('click', function() {
            self.openUserModal();
        });
        document.getElementById('form-user').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleUserSubmit();
        });
        document.getElementById('btn-save-permissions').addEventListener('click', function() {
            self.handleSavePermissions();
        });
        document.getElementById('btn-save-shifts').addEventListener('click', function() {
            self.saveShiftSettings();
        });
        document.getElementById('btn-add-shift').addEventListener('click', function() {
            self.addShiftRow();
        });
        document.getElementById('btn-create-backup').addEventListener('click', function() {
            self.createBackup();
        });
        document.getElementById('form-reset-password').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleResetPassword();
        });
        document.getElementById('btn-upload-backup').addEventListener('click', function() {
            self.uploadBackup();
        });
        document.getElementById('btn-reset-system').addEventListener('click', function() {
            self.openModal('reset-system');
        });
        document.getElementById('form-reset-system').addEventListener('submit', function(e) {
            e.preventDefault();
            self.handleResetSystem();
        });
        document.getElementById('btn-export-stock-xlsx').addEventListener('click', function() {
            self.exportStockXLSX();
        });
        document.getElementById('stock-xlsx-file-input').addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                self.importStockXLSX(e.target.files[0]);
                e.target.value = '';
            }
        });
    },

    // Switch active view tab
    switchTab: function(tab) {
        if (!this.userHasPermission(tab)) {
            this.showToast('لا تملك صلاحية الوصول لهذه الصفحة', 'warning');
            if (tab !== 'dashboard') {
                this.switchTab('dashboard');
            }
            return;
        }

        var menuItems = document.querySelectorAll('.menu-item');
        for (var i = 0; i < menuItems.length; i++) {
            if (menuItems[i].getAttribute('data-tab') === tab) {
                menuItems[i].classList.add('active');
            } else {
                menuItems[i].classList.remove('active');
            }
        }

        var contents = document.querySelectorAll('.tab-content');
        for (var i = 0; i < contents.length; i++) {
            if (contents[i].id === 'tab-' + tab) {
                contents[i].classList.add('active');
            } else {
                contents[i].classList.remove('active');
            }
        }

        var meta = this.tabMeta[tab];
        if (meta) {
            document.getElementById('page-title').innerText = meta.title;
            document.getElementById('page-subtitle').innerText = meta.subtitle;
        }

        this.activeTab = tab;
        this.loadTab(tab);
    },

    // Dynamic loading of tab data
    loadTab: function(tab) {
        switch (tab) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'employees':
                this.employeeView = 'active';
                this.switchEmployeeView('active');
                break;
            case 'attendance':
                this.loadEmployeesList();
                this.loadAttendanceData();
                break;
            case 'finance':
                this.loadEmployeesList();
                this.loadFinanceData();
                break;
            case 'payroll':
                this.loadEmployeesList();
                break;
            case 'inventory':
                this.loadInventoryData();
                break;
            case 'treasury':
                this.loadTreasury();
                break;
            case 'settings':
                this.loadSettingsTab();
                break;
            case 'permissions':
                this.loadPermissionsTab();
                break;
        }
    },

    // ==================== DASHBOARD TAB ====================
    loadDashboardData: function() {
        var self = this;
        this.apiCall(API_BASE + '/dashboard/summary', 'GET', null, function(err, data) {
            if (err) {
                console.error(err);
                self.showToast('فشل في جلب إحصائيات لوحة التحكم', 'error');
                return;
            }
            
            document.getElementById('stat-employees-count').innerText = data.employees_count;
            document.getElementById('stat-attendance-today').innerText = data.attendance_today;
            document.getElementById('stat-treasury-balance').innerText = (data.treasury_balance || 0) + ' ج.م';
            document.getElementById('stat-low-stock').innerText = data.low_stock_count;
        });

        // Load today's attendance brief
        var today = new Date();
        var todayStr = today.getFullYear() + '-' + this.padZero(today.getMonth() + 1) + '-' + this.padZero(today.getDate());
        
        this.apiCall(API_BASE + '/attendance?start_date=' + todayStr + '&end_date=' + todayStr, 'GET', null, function(err, attData) {
            var tbody = document.querySelector('#dashboard-attendance-table tbody');
            tbody.innerHTML = '';
            
            if (err || attData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد سجلات حضور لليوم بعد.</td></tr>';
                return;
            }

            var limit = Math.min(attData.length, 5);
            for (var i = 0; i < limit; i++) {
                var row = attData[i];
                var tr = document.createElement('tr');
                tr.innerHTML = '<td>' + row.employee_name + '</td>' +
                               '<td><span class="badge badge-secondary">' + app.getShiftName(row.shift) + '</span></td>' +
                               '<td>' + self.to12h(row.check_in) + '</td>' +
                               '<td>' + self.to12h(row.check_out) + '</td>' +
                               '<td>' + row.hours_worked + ' ساعة</td>';
                tbody.appendChild(tr);
            }
        });

        // Load low stock items list
        this.apiCall(API_BASE + '/inventory', 'GET', null, function(err, invData) {
            var alertsUl = document.getElementById('dashboard-stock-alerts');
            alertsUl.innerHTML = '';
            
            if (err || invData.length === 0) {
                alertsUl.innerHTML = '<li class="no-alerts text-muted">المخزون بحالة ممتازة ولا توجد تنبيهات.</li>';
                return;
            }

            var lowStockItems = invData.filter(function(item) {
                return item.quantity <= item.min_stock;
            });
            
            if (lowStockItems.length === 0) {
                alertsUl.innerHTML = '<li class="no-alerts text-muted">المخزون بحالة ممتازة ولا توجد تنبيهات.</li>';
                return;
            }

            var limit = Math.min(lowStockItems.length, 5);
            for (var i = 0; i < limit; i++) {
                var item = lowStockItems[i];
                var li = document.createElement('li');
                li.className = 'stock-alert-item';
                li.innerHTML = '<div class="alert-item-info">' +
                               '<span class="alert-item-title">' + item.item_name + '</span>' +
                               '<span class="alert-item-desc">كود: ' + item.item_code + ' | حد الطلب: ' + item.min_stock + '</span>' +
                               '</div>' +
                               '<span class="alert-item-qty">' + item.quantity + ' ' + item.unit + '</span>';
                alertsUl.appendChild(li);
            }
        });
    },

    // ==================== EMPLOYEES TAB ====================
    switchEmployeeView: function(view) {
        this.employeeView = view;
        document.getElementById('btn-employees-active').className = view === 'active' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
        document.getElementById('btn-employees-archived').className = view === 'inactive' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
        document.getElementById('employees-table-title').innerText = view === 'active' ? 'قائمة الموظفين النشطين' : 'أرشيف الموظفين الموقوفين';
        document.getElementById('btn-add-employee').style.display = view === 'active' ? '' : 'none';
        this.loadEmployeesData();
    },

    confirmAction: function(title, message, callback) {
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-message').innerText = message;
        this._confirmCallback = callback;
        this.openModal('confirm');
    },

    loadEmployeesData: function() {
        var self = this;
        var viewStatus = this.employeeView || 'active';
        this.apiCall(API_BASE + '/employees?status=' + viewStatus, 'GET', null, function(err, data) {
            if (err) {
                console.error(err);
                self.showToast('فشل في جلب بيانات الموظفين', 'error');
                return;
            }
            
            // Also update full list for dropdowns
            if (viewStatus === 'active') {
                self.employeesList = data;
            }
            
            var tbody = document.querySelector('#employees-table tbody');
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                var emptyMsg = viewStatus === 'active' ? 'لا يوجد موظفين نشطين حالياً.' : 'لا يوجد موظفين في الأرشيف.';
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">' + emptyMsg + '</td></tr>';
                return;
            }

            var isArchived = viewStatus === 'inactive';

            data.forEach(function(emp, index) {
                var tr = document.createElement('tr');
                var rateText = emp.pay_type === 'hourly' ? emp.rate + ' ج.م / ساعة' : emp.rate + ' ج.م / وردية';
                var payTypeText = emp.pay_type === 'hourly' ? 'بالساعة' : 'بالوردية';
                var statusText = emp.status === 'active' ? 'نشط' : 'غير نشط';
                var statusClass = emp.status === 'active' ? 'badge-success' : 'badge-danger';
                var shiftText = app.getShiftName(emp.default_shift);

                var actionsHtml;
                if (isArchived) {
                    actionsHtml = '<button class="action-btn" title="استعادة الموظف" onclick="app.restoreEmployee(' + emp.id + ')">♻️</button>';
                } else {
                    actionsHtml = '<button class="action-btn" title="تعديل الموظف" onclick="app.editEmployee(' + emp.id + ')">✏️</button>' +
                                   '<button class="action-btn" title="حذف موظف" onclick="app.deleteEmployee(' + emp.id + ')">🗑️</button>';
                }

                tr.innerHTML = '<td>' + (emp.employee_code || '-') + '</td>' +
                               '<td><strong>' + emp.name + '</strong></td>' +
                               '<td>' + (emp.national_id || '-') + '</td>' +
                               '<td>' + (emp.phone || '-') + '</td>' +
                               '<td>' + payTypeText + '</td>' +
                               '<td>' + rateText + '</td>' +
                               '<td>' + shiftText + '</td>' +
                               '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
                               '<td>' +
                               '<div class="action-buttons">' + actionsHtml +
                               '</div>' +
                               '</td>';
                tbody.appendChild(tr);
            });
        });
    },

    openEmployeeModal: function() {
        document.getElementById('form-employee').reset();
        document.getElementById('employee-id').value = '';
        document.getElementById('employee-national-id').value = '';
        document.getElementById('employee-shift-start').value = '';
        document.getElementById('employee-shift-end').value = '';
        document.getElementById('employee-modal-title').innerText = 'إضافة موظف جديد';
        document.getElementById('employee-status-group').style.display = 'none';
        this.toggleRateLabel('hourly');
        this.openModal('employee');
    },

    toggleRateLabel: function(type) {
        var label = document.getElementById('rate-label');
        if (type === 'hourly') {
            label.innerText = 'سعر الساعة (ج.م)';
        } else {
            label.innerText = 'سعر الوردية الثابت (ج.م)';
        }
    },

    handleEmployeeSubmit: function() {
        var self = this;
        var id = document.getElementById('employee-id').value;
        var name = document.getElementById('employee-name').value;
        var employee_code = document.getElementById('employee-code').value;
        var phone = document.getElementById('employee-phone').value;
        var national_id = document.getElementById('employee-national-id').value;
        var pay_type = document.getElementById('employee-pay-type').value;
        var rate = document.getElementById('employee-rate').value;
        var default_shift = document.getElementById('employee-shift').value;
        var shift_start_time = document.getElementById('employee-shift-start').value;
        var shift_end_time = document.getElementById('employee-shift-end').value;
        var status = document.getElementById('employee-status').value || 'active';

        var payload = { id: id, name: name, employee_code: employee_code, phone: phone, national_id: national_id, pay_type: pay_type, rate: rate, default_shift: default_shift, shift_start_time: shift_start_time, shift_end_time: shift_end_time, status: status };
        var endpoint = id ? '/employees/update' : '/employees/add';

        this.apiCall(API_BASE + endpoint, 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                return;
            }
            self.showToast(id ? 'تم تعديل بيانات الموظف بنجاح' : 'تم إضافة الموظف بنجاح');
            document.getElementById('modal-employee').classList.remove('open');
            self.loadEmployeesData();
        });
    },

    editEmployee: function(id) {
        var emp = null;
        for (var i = 0; i < this.employeesList.length; i++) {
            if (this.employeesList[i].id === id) {
                emp = this.employeesList[i];
                break;
            }
        }
        if (!emp) return;

        document.getElementById('employee-id').value = emp.id;
        document.getElementById('employee-name').value = emp.name;
        document.getElementById('employee-code').value = emp.employee_code || '';
        document.getElementById('employee-phone').value = emp.phone || '';
        document.getElementById('employee-national-id').value = emp.national_id || '';
        document.getElementById('employee-pay-type').value = emp.pay_type;
        document.getElementById('employee-rate').value = emp.rate;
        document.getElementById('employee-shift').value = emp.default_shift;
        document.getElementById('employee-shift-start').value = emp.shift_start_time || '';
        document.getElementById('employee-shift-end').value = emp.shift_end_time || '';
        document.getElementById('employee-status').value = emp.status;
        
        document.getElementById('employee-modal-title').innerText = 'تعديل بيانات الموظف';
        document.getElementById('employee-status-group').style.display = 'block';
        this.toggleRateLabel(emp.pay_type);
        this.openModal('employee');
    },

    deleteEmployee: function(id) {
        var self = this;
        this.confirmAction('تعطيل موظف', 'هل أنت متأكد من تعطيل هذا الموظف؟ لن يظهر في الحضور الجديد ولكنه سيبقى في السجلات التاريخية.', function() {
            self.apiCall(API_BASE + '/employees/delete', 'POST', { id: id }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم تعطيل الموظف بنجاح');
                self.loadEmployeesData();
            });
        });
    },

    restoreEmployee: function(id) {
        var self = this;
        this.confirmAction('استعادة موظف', 'هل تريد استعادة هذا الموظف وتفعيله مجدداً؟', function() {
            self.apiCall(API_BASE + '/employees/restore', 'POST', { id: id }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم استعادة الموظف بنجاح');
                self.loadEmployeesData();
            });
        });
    },

    // ==================== ATTENDANCE TAB ====================
    loadAttendanceData: function() {
        var self = this;
        var start = document.getElementById('attendance-filter-start').value;
        var end = document.getElementById('attendance-filter-end').value;
        
        this.apiCall(API_BASE + '/attendance?start_date=' + start + '&end_date=' + end, 'GET', null, function(err, data) {
            var tbody = document.querySelector('#attendance-table tbody');
            tbody.innerHTML = '';
            
            if (err || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">لا توجد سجلات حضور للفترة المحددة.</td></tr>';
                return;
            }

            data.forEach(function(row) {
                var tr = document.createElement('tr');
                var shiftText = app.getShiftName(row.shift);
                var payTypeText = row.pay_type === 'hourly' ? 'بالساعة' : 'بالوردية';
                var overtimeText = row.overtime_hours > 0 ? '<span class="text-success">+' + row.overtime_hours + '</span>' : '-';
                var lateText = row.is_late ? '<span class="text-danger">اخر ' + row.late_minutes + ' د</span>' : '-';
                var excuseText = row.excuse ? '<small>' + row.excuse + '</small>' : '';

                tr.innerHTML = '<td>' + row.date + '</td>' +
                               '<td><strong>' + row.employee_name + '</strong></td>' +
                               '<td>' + payTypeText + '</td>' +
                               '<td><span class="badge badge-secondary">' + shiftText + '</span></td>' +
                               '<td>' + self.to12h(row.check_in) + '</td>' +
                               '<td>' + self.to12h(row.check_out) + '</td>' +
                               '<td>' + row.hours_worked + ' س</td>' +
                               '<td>' + overtimeText + '</td>' +
                               '<td>' + lateText + ' ' + excuseText + '</td>' +
                               '<td>' +
                               '<button class="action-btn" title="حذف السجل" onclick="app.deleteAttendance(' + row.id + ')">🗑️</button>' +
                               '</td>';
                tbody.appendChild(tr);
            });
        });
    },

    handleAttendanceSubmit: function() {
        var self = this;
        var employee_id = document.getElementById('attendance-employee-id').value;
        var date = document.getElementById('attendance-date').value;
        var shift = document.getElementById('attendance-shift').value;
        var excuse = document.getElementById('attendance-excuse').value;
        var notes = document.getElementById('attendance-notes').value;
        
        var h1 = self.padZero(parseInt(document.getElementById('check-in-hour').value, 10) || 0);
        var m1 = self.padZero(parseInt(document.getElementById('check-in-min').value, 10) || 0);
        var ap1 = document.getElementById('check-in-ampm').getAttribute('data-value');
        var check_in = h1 + ':' + m1 + ' ' + ap1;

        var h2 = self.padZero(parseInt(document.getElementById('check-out-hour').value, 10) || 0);
        var m2 = self.padZero(parseInt(document.getElementById('check-out-min').value, 10) || 0);
        var ap2 = document.getElementById('check-out-ampm').getAttribute('data-value');
        var check_out = h2 + ':' + m2 + ' ' + ap2;

        var payload = { employee_id: employee_id, date: date, shift: shift, check_in: check_in, check_out: check_out, notes: notes, excuse: excuse };

        this.apiCall(API_BASE + '/attendance/log', 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                return;
            }
            var msg = 'تم تسجيل حضور الموظف بنجاح';
            if (result.late_minutes > 0) {
                msg += ' | تاخر ' + result.late_minutes + ' دقيقة | خصم ' + result.deduction_hours + ' ساعة';
            }
            self.showToast(msg);
            document.getElementById('modal-attendance').classList.remove('open');
            self.loadAttendanceData();
            self.loadDashboardData();
        });
    },

    deleteAttendance: function(id) {
        var self = this;
        this.confirmAction('حذف سجل حضور', 'هل تريد حذف سجل الحضور هذا نهائياً؟', function() {
            self.apiCall(API_BASE + '/attendance/delete', 'POST', { id: id }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم حذف سجل الحضور');
                self.loadAttendanceData();
                self.loadDashboardData();
            });
        });
    },

    // ==================== FAST CHECK-IN/OUT ====================
    openFastCheckModal: function() {
        var self = this;
        var now = new Date();
        var todayStr = now.getFullYear() + '-' + self.padZero(now.getMonth() + 1) + '-' + self.padZero(now.getDate());
        var h24 = now.getHours();
        var h12 = h24 % 12 || 12;
        var ampm = h24 < 12 ? 'AM' : 'PM';
        var m = now.getMinutes();

        document.getElementById('fast-check-date').value = todayStr;

        var hEl = document.getElementById('fast-check-hour');
        var mEl = document.getElementById('fast-check-min');
        var aEl = document.getElementById('fast-check-ampm');
        if (hEl) hEl.value = h12;
        if (mEl) mEl.value = Math.floor(m / 5) * 5;
        if (aEl) {
            aEl.setAttribute('data-value', ampm);
            aEl.textContent = ampm === 'AM' ? 'صباحاً' : 'مساءً';
        }

        document.getElementById('fast-check-notes').value = '';
        document.getElementById('fast-check-employee-id').value = '';
        document.getElementById('fast-check-employee-search').value = '';
        document.getElementById('fast-check-employee-dropdown').innerHTML = '';
        document.getElementById('fast-check-employee-dropdown').classList.remove('open');

        this.apiCall(API_BASE + '/employees', 'GET', null, function(err, data) {
            if (err) return;
            self._fastCheckEmployees = data.filter(function(e) { return e.status === 'active'; });
            self._renderFastCheckDropdown(self._fastCheckEmployees);
        });
        this.openModal('fast-check');
        setTimeout(function() { document.getElementById('fast-check-employee-search').focus(); }, 100);
    },

    _renderFastCheckDropdown: function(list) {
        var dropdown = document.getElementById('fast-check-employee-dropdown');
        dropdown.innerHTML = '';
        for (var i = 0; i < list.length; i++) {
            var emp = list[i];
            var item = document.createElement('div');
            item.className = 'searchable-select-item';
            item.textContent = emp.name + (emp.employee_code ? ' (' + emp.employee_code + ')' : '');
            item.setAttribute('data-emp-id', emp.id);
            item.onclick = function() {
                document.getElementById('fast-check-employee-id').value = this.getAttribute('data-emp-id');
                document.getElementById('fast-check-employee-search').value = this.textContent;
                document.getElementById('fast-check-employee-dropdown').classList.remove('open');
            };
            dropdown.appendChild(item);
        }
    },

    _filterFastCheckDropdown: function(query) {
        var q = query.trim().toLowerCase();
        var items = document.querySelectorAll('#fast-check-employee-dropdown .searchable-select-item');
        var visibleCount = 0;
        for (var i = 0; i < items.length; i++) {
            var matches = items[i].textContent.toLowerCase().indexOf(q) !== -1;
            items[i].style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
        }
        var dropdown = document.getElementById('fast-check-employee-dropdown');
        if (visibleCount > 0) {
            dropdown.classList.add('open');
        } else {
            dropdown.classList.remove('open');
        }
    },

    handleFastCheck: function() {
        var self = this;
        var employee_id = document.getElementById('fast-check-employee-id').value;
        var date = document.getElementById('fast-check-date').value;
        var notes = document.getElementById('fast-check-notes').value;

        var h = parseInt(document.getElementById('fast-check-hour').value, 10);
        var m = parseInt(document.getElementById('fast-check-min').value, 10);
        var ampm = document.getElementById('fast-check-ampm').getAttribute('data-value');
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        var time = self.padZero(h) + ':' + self.padZero(m);

        if (!employee_id) {
            self.showToast('يجب اختيار الموظف', 'warning');
            return;
        }

        var payload = { employee_id: employee_id, date: date, time: time, notes: notes };

        this.apiCall(API_BASE + '/attendance/fast-check', 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                return;
            }
            var actionText = '';
            if (result.action === 'check_in') actionText = 'تم تسجيل حضور الدوام';
            else if (result.action === 'check_out') actionText = 'تم تسجيل انصراف الموظف';
            else if (result.action === 'new_check_in') actionText = 'تم تسجيل حضور جديد';

            self.showToast(actionText + ' في ' + result.time);
            document.getElementById('modal-fast-check').classList.remove('open');
            if (self.activeTab === 'attendance') self.loadAttendanceData();
            self.loadDashboardData();
        });
    },

    // ==================== LOANS & FINANCE TAB ====================
    loadFinanceData: function() {
        var self = this;
        this.apiCall(API_BASE + '/transactions', 'GET', null, function(err, data) {
            if (err) {
                self.showToast('فشل في جلب البيانات المالية والسلف', 'error');
                return;
            }
            
            // Render outstanding balances
            var balancesContainer = document.getElementById('loan-balances-container');
            balancesContainer.innerHTML = '';
            
            var empIds = Object.keys(data.balances);
            if (empIds.length === 0) {
                balancesContainer.innerHTML = '<p class="text-center text-muted">لا يوجد موظفون نشطون حالياً.</p>';
            } else {
                empIds.forEach(function(id) {
                    var balance = data.balances[id];
                    var div = document.createElement('div');
                    div.className = 'loan-balance-card';
                    var outstandingVal = balance.outstanding_loan;
                    var valClass = outstandingVal > 0 ? '' : 'zero';
                    
                    div.innerHTML = '<span class="loan-balance-name">' + balance.name + '</span>' +
                                   '<span class="loan-balance-val ' + valClass + '">' + outstandingVal + ' ج.م</span>';
                    balancesContainer.appendChild(div);
                });
            }

            // Render transactions history
            var tbody = document.querySelector('#transactions-table tbody');
            tbody.innerHTML = '';
            
            if (data.transactions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">لا توجد حركات مالية مسجلة بعد.</td></tr>';
                return;
            }

            data.transactions.forEach(function(row) {
                var tr = document.createElement('tr');
                var typeText = '';
                var typeClass = '';
                
                if (row.type === 'loan') {
                    typeText = '💸 سلفة شخصية';
                    typeClass = 'text-danger';
                } else if (row.type === 'bonus') {
                    typeText = '➕ مكافأة';
                    typeClass = 'text-success';
                } else if (row.type === 'deduction') {
                    typeText = '➖ خصم';
                    typeClass = 'text-danger';
                }

                var payrollStatus = row.payroll_id 
                    ? '<span class="badge badge-success">تمت التسوية (كشف #' + row.payroll_id + ')</span>' 
                    : '<span class="badge badge-warning">معلق / قيد الحساب</span>';

                tr.innerHTML = '<td>' + row.date + '</td>' +
                               '<td><strong>' + row.employee_name + '</strong></td>' +
                               '<td><span class="' + typeClass + '">' + typeText + '</span></td>' +
                               '<td><strong>' + row.amount + ' ج.م</strong></td>' +
                               '<td><small>' + (row.description || '-') + '</small></td>' +
                               '<td>' + payrollStatus + '</td>' +
                               '<td>' +
                               (row.payroll_id ? '-' : '<button class="action-btn" title="حذف الحركة" onclick="app.deleteTransaction(' + row.id + ')">🗑️</button>') +
                               '</td>';
                tbody.appendChild(tr);
            });
        });
    },

    filterLoanBalances: function() {
        var query = document.getElementById('loan-balances-search').value.trim().toLowerCase();
        var cards = document.querySelectorAll('#loan-balances-container .loan-balance-card');
        for (var i = 0; i < cards.length; i++) {
            var nameEl = cards[i].querySelector('.loan-balance-name');
            if (nameEl) {
                var name = nameEl.innerText.toLowerCase();
                cards[i].style.display = name.indexOf(query) !== -1 ? '' : 'none';
            }
        }
    },

    handleTransactionSubmit: function() {
        var self = this;
        var employee_id = document.getElementById('transaction-employee-id').value;
        var type = document.getElementById('transaction-type').value;
        var amount = document.getElementById('transaction-amount').value;
        var date = document.getElementById('transaction-date').value;
        var description = document.getElementById('transaction-desc').value;

        var payload = { employee_id: employee_id, type: type, amount: amount, date: date, description: description };

        this.apiCall(API_BASE + '/transactions/add', 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                return;
            }
            self.showToast('تم إضافة الحركة المالية للموظف بنجاح');
            document.getElementById('modal-transaction').classList.remove('open');
            self.loadFinanceData();
            self.loadDashboardData();
        });
    },

    deleteTransaction: function(id) {
        var self = this;
        this.confirmAction('حذف معاملة مالية', 'هل تريد حذف هذه المعاملة المالية؟', function() {
            self.apiCall(API_BASE + '/transactions/delete', 'POST', { id: id }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم حذف الحركة المالية بنجاح');
                self.loadFinanceData();
                self.loadDashboardData();
            });
        });
    },

    // ==================== PAYROLL TAB ====================
    calculatePayroll: function() {
        var self = this;
        var start = document.getElementById('payroll-start-date').value;
        var end = document.getElementById('payroll-end-date').value;

        if (!start || !end) {
            this.showToast('يرجى تحديد فترة حساب الرواتب بوضوح', 'warning');
            return;
        }

        this.apiCall(API_BASE + '/payroll/calculate?start_date=' + start + '&end_date=' + end, 'GET', null, function(err, data) {
            if (err || data.error) {
                self.showToast((err ? err.message : data.error) || 'فشل احتساب الرواتب', 'error');
                return;
            }

            self.currentPayrollData = data;
            var tbody = document.getElementById('payroll-tbody');
            tbody.innerHTML = '';

            if (data.records.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">لا يوجد عمال نشطون لحساب أجورهم.</td></tr>';
                document.getElementById('payroll-preview-card').style.display = 'block';
                document.getElementById('payroll-export-actions').style.display = 'none';
                return;
            }

            data.records.forEach(function(rec, idx) {
                var tr = document.createElement('tr');
                tr.setAttribute('data-emp-id', rec.employee_id);
                
                var rateText = rec.pay_type === 'hourly' ? rec.rate + ' ج.م/ساعة' : rec.rate + ' ج.م/وردية';
                var workText = rec.pay_type === 'hourly' 
                    ? rec.total_hours + ' ساعة' 
                    : rec.total_shifts + ' وردية' + (rec.overtime_hours > 0 ? ' (+' + rec.overtime_hours + ' س.إضافي)' : '');
                
                tr.innerHTML = '<td><strong>' + rec.name + '</strong></td>' +
                               '<td>' + (rec.pay_type === 'hourly' ? 'بالساعة' : 'بالوردية') + '</td>' +
                               '<td>' + rateText + '</td>' +
                               '<td>' + workText + '</td>' +
                               '<td>' + rec.base_salary + ' ج.م</td>' +
                               '<td>' + (rec.overtime_pay > 0 ? rec.overtime_pay + ' ج.م' : '-') + '</td>' +
                               '<td><span class="text-success">+' + rec.total_bonuses + ' ج.م</span></td>' +
                               '<td><span class="text-danger">-' + rec.total_deductions + ' ج.م</span></td>' +
                               '<td><small class="text-warning">' + rec.outstanding_loan_balance + ' ج.م مستحق</small></td>' +
                               '<td>' +
                               '<input type="number" ' +
                               'class="payroll-input-sm loan-deduction-input" ' +
                               'data-idx="' + idx + '" ' +
                               'value="' + rec.suggested_loan_deduction + '" ' +
                               'max="' + rec.outstanding_loan_balance + '" ' +
                               'min="0" ' +
                               'step="5" ' +
                               'oninput="app.updateNetSalaryDisplay(' + idx + ', this.value)">' +
                               '</td>' +
                               '<td><strong class="text-primary" id="net-val-' + idx + '">' + (rec.net_salary - rec.suggested_loan_deduction) + ' ج.م</strong></td>';
                
                // Set the default calculated net salary to the record memory
                self.currentPayrollData.records[idx].loan_deduction = rec.suggested_loan_deduction;
                self.currentPayrollData.records[idx].final_net_salary = rec.base_salary + rec.total_bonuses - rec.total_deductions - rec.suggested_loan_deduction;
                
                tbody.appendChild(tr);
            });

            document.getElementById('payroll-preview-card').style.display = 'block';
            document.getElementById('payroll-export-actions').style.display = 'flex';
            self.showToast('تم احتساب كشف الأجور بنجاح، يمكنك تعديل مستقطع السلفة يدوياً لكل عامل');
        });
    },

    updateNetSalaryDisplay: function(idx, val) {
        var numVal = parseFloat(val) || 0;
        var rec = this.currentPayrollData.records[idx];
        
        // Ensure values remain within safety limit
        if (numVal > rec.outstanding_loan_balance) {
            this.showToast('لا يمكن خصم قيمة أكبر من السلفة القائمة!', 'warning');
            return;
        }

        var bonuses = rec.total_bonuses;
        var deductions = rec.total_deductions;
        var net = rec.base_salary + bonuses - deductions - numVal;
        
        document.getElementById('net-val-' + idx).innerText = net.toFixed(2) + ' ج.م';
        
        // Save to current memory
        this.currentPayrollData.records[idx].loan_deduction = numVal;
        this.currentPayrollData.records[idx].final_net_salary = net;
    },

    filterPayrollTable: function() {
        var query = document.getElementById('payroll-search').value.trim().toLowerCase();
        var rows = document.querySelectorAll('#payroll-tbody tr');
        for (var i = 0; i < rows.length; i++) {
            var nameCell = rows[i].querySelector('td:first-child');
            if (nameCell) {
                var name = nameCell.innerText.trim().toLowerCase();
                rows[i].style.display = name.indexOf(query) !== -1 ? '' : 'none';
            }
        }
    },

    savePayroll: function() {
        var self = this;
        if (!this.currentPayrollData) return;
        this.confirmAction('إغلاق مسير الرواتب', 'هل أنت متأكد من إغلاق مسير الرواتب وتسجيله في النظام؟ سيتم تسوية جميع المكافآت والخصومات المعلقة وحذف المستقطع من السلف.', function() {

        var payload = {
            start_date: self.currentPayrollData.start_date,
            end_date: self.currentPayrollData.end_date,
            records: self.currentPayrollData.records.map(function(rec) {
                return {
                    employee_id: rec.employee_id,
                    total_hours: rec.total_hours,
                    total_shifts: rec.total_shifts,
                    base_salary: rec.base_salary,
                    total_bonuses: rec.total_bonuses,
                    total_deductions: rec.total_deductions,
                    loan_deduction: rec.loan_deduction,
                    net_salary: rec.final_net_salary
                };
            })
        };

        self.apiCall(API_BASE + '/payroll/save', 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'فشل في حفظ مسير الرواتب', 'error');
                return;
            }
            self.showToast('تم تسجيل وإغلاق مسير الرواتب بنجاح وتسوية الأرصدة والسلف!');
            self.currentPayrollData = null;
            document.getElementById('payroll-preview-card').style.display = 'none';
            document.getElementById('payroll-export-actions').style.display = 'none';
        });
        });
    },

    exportPayrollCSV: function() {
        var start = document.getElementById('payroll-start-date').value;
        var end = document.getElementById('payroll-end-date').value;
        if (!start || !end) return;

        window.location.href = API_BASE + '/payroll/export?start_date=' + start + '&end_date=' + end;
        this.showToast('جاري تصدير كشف الرواتب إلى جهازك...');
    },

    // ==================== INVENTORY TAB ====================
    loadInventoryData: function() {
        var self = this;
        this.apiCall(API_BASE + '/inventory', 'GET', null, function(err, data) {
            if (err) {
                self.showToast('فشل في جلب بضائع المخزن', 'error');
                return;
            }
            self._inventoryData = data || [];
            self.renderInventoryTable();
        });
    },

    renderInventoryTable: function() {
        var self = this;
        var search = (document.getElementById('inventory-search').value || '').toLowerCase().trim();
        var stockFilter = document.getElementById('inventory-stock-filter').value;
        var tbody = document.querySelector('#inventory-table tbody');
        tbody.innerHTML = '';

        var filtered = (this._inventoryData || []).filter(function(row) {
            if (search && row.item_name.toLowerCase().indexOf(search) === -1 &&
                row.item_code.toLowerCase().indexOf(search) === -1) return false;
            if (stockFilter === 'low' && row.quantity > row.min_stock) return false;
            return true;
        });

        document.getElementById('inventory-count').textContent = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">لا توجد نتائج مطابقة.</td></tr>';
            return;
        }

        filtered.forEach(function(row) {
            var tr = document.createElement('tr');
            var isLow = row.quantity <= row.min_stock;
            var statusHtml = isLow
                ? '<span class="badge badge-danger">ناقص</span>'
                : '';

            tr.innerHTML = '<td><code>' + row.item_code + '</code></td>' +
                           '<td><strong>' + row.item_name + '</strong></td>' +
                           '<td class="' + (isLow ? 'text-danger' : '') + '"><strong>' + row.quantity + '</strong></td>' +
                           '<td>' + row.unit + '</td>' +
                           '<td>' + (row.wholesale_price || 0) + '</td>' +
                           '<td>' + (row.last_purchase_price || 0) + '</td>' +
                           '<td>' + (row.avg_purchase_price || 0) + '</td>' +
                           '<td>' + (row.market_price || 0) + '</td>' +
                           '<td>' + row.min_stock + ' ' + statusHtml + '</td>' +
                           '<td>' +
                           '<div class="action-buttons">' +
                           '<button class="action-btn" title="تعديل" onclick="app.editInventoryItem(' + row.id + ')">✏️</button>' +
                           '<button class="action-btn" title="حذف" onclick="app.deleteInventoryItem(' + row.id + ')">🗑️</button>' +
                           '</div>' +
                           '</td>';
            tbody.appendChild(tr);
        });
    },

    openInventoryModal: function() {
        document.getElementById('form-inventory').reset();
        document.getElementById('inventory-id').value = '';
        document.getElementById('inventory-modal-title').innerText = 'إضافة صنف جديد للمخزن';
        this.openModal('inventory');
    },

    handleInventorySubmit: function() {
        var self = this;
        var id = document.getElementById('inventory-id').value;
        var item_name = document.getElementById('inventory-name').value;
        var item_code = document.getElementById('inventory-code').value;
        var quantity = document.getElementById('inventory-quantity').value;
        var unit = document.getElementById('inventory-unit').value;
        var purchase_price = document.getElementById('inventory-purchase').value;
        var sale_price = document.getElementById('inventory-sale').value;
        var min_stock = document.getElementById('inventory-min').value;
        var description = document.getElementById('inventory-desc').value;

        var payload = { id: id, item_name: item_name, item_code: item_code, quantity: quantity, unit: unit, purchase_price: purchase_price, sale_price: sale_price, min_stock: min_stock, description: description };
        var endpoint = id ? '/inventory/update' : '/inventory/add';

        this.apiCall(API_BASE + endpoint, 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                return;
            }
            self.showToast(id ? 'تم تعديل الصنف بنجاح' : 'تم إضافة الصنف للمخزن بنجاح');
            document.getElementById('modal-inventory').classList.remove('open');
            self.loadInventoryData();
            self.loadDashboardData();
        });
    },

    editInventoryItem: function(id) {
        var self = this;
        this.apiCall(API_BASE + '/inventory', 'GET', null, function(err, data) {
            if (err) {
                self.showToast('فشل تحميل بيانات الصنف', 'error');
                return;
            }
            
            var item = null;
            for (var i = 0; i < data.length; i++) {
                if (data[i].id === id) {
                    item = data[i];
                    break;
                }
            }
            if (!item) return;

            document.getElementById('inventory-id').value = item.id;
            document.getElementById('inventory-name').value = item.item_name;
            document.getElementById('inventory-code').value = item.item_code;
            document.getElementById('inventory-quantity').value = item.quantity;
            document.getElementById('inventory-unit').value = item.unit;
            document.getElementById('inventory-purchase').value = item.purchase_price;
            document.getElementById('inventory-sale').value = item.sale_price;
            document.getElementById('inventory-min').value = item.min_stock;
            document.getElementById('inventory-desc').value = item.description;

            document.getElementById('inventory-modal-title').innerText = 'تعديل بيانات الصنف في المخزن';
            self.openModal('inventory');
        });
    },

    deleteInventoryItem: function(id) {
        var self = this;
        this.confirmAction('حذف صنف من المخزن', 'هل تريد حذف هذا الصنف من المخزن نهائياً؟', function() {
            self.apiCall(API_BASE + '/inventory/delete', 'POST', { id: id }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم حذف الصنف بنجاح');
                self.loadInventoryData();
                self.loadDashboardData();
            });
        });
    },

    // ==================== TREASURY TAB ====================
    loadTreasury: function() {
        var self = this;
        
        // Load balance
        this.apiCall(API_BASE + '/treasury/balance', 'GET', null, function(err, data) {
            if (err) return;
            document.getElementById('treasury-balance').innerText = (data.balance || 0) + ' ج.م';
            document.getElementById('treasury-deposits').innerText = (data.deposits || 0) + ' ج.م';
            document.getElementById('treasury-withdrawals').innerText = (data.withdrawals || 0) + ' ج.م';
        });
        
        // Load transactions
        this.apiCall(API_BASE + '/treasury', 'GET', null, function(err, data) {
            var tbody = document.getElementById('treasury-table-body');
            tbody.innerHTML = '';
            
            if (err || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا توجد معاملات مالية بعد.</td></tr>';
                return;
            }

            data.forEach(function(row) {
                var tr = document.createElement('tr');
                var typeText = row.type === 'deposit' ? 'وارد' : 'مصروف';
                var typeClass = row.type === 'deposit' ? 'text-success' : 'text-danger';
                var amountClass = row.type === 'deposit' ? 'text-success' : 'text-danger';
                var sign = row.type === 'deposit' ? '+' : '-';
                
                tr.innerHTML = '<td>' + row.date + '</td>' +
                               '<td><span class="' + typeClass + '"><strong>' + typeText + '</strong></span></td>' +
                               '<td><strong class="' + amountClass + '">' + sign + row.amount + ' ج.م</strong></td>' +
                               '<td><small>' + (row.description || row.source || '-') + '</small></td>' +
                               '<td><small>' + (row.category || '-') + '</small></td>' +
                               '<td>' + (row.balance_after || 0) + ' ج.م</td>';
                tbody.appendChild(tr);
            });
        });
    },

    showTreasuryModal: function(type) {
        document.getElementById('form-treasury').reset();
        document.getElementById('treasury-type').value = type;
        var today = new Date();
        document.getElementById('treasury-date').value = today.getFullYear() + '-' + this.padZero(today.getMonth() + 1) + '-' + this.padZero(today.getDate());
        
        if (type === 'deposit') {
            document.getElementById('treasury-modal-title').innerText = 'ايداع جديد (وارد)';
            document.getElementById('treasury-category-group').style.display = 'none';
        } else {
            document.getElementById('treasury-modal-title').innerText = 'سحب / مصروف جديد';
            document.getElementById('treasury-category-group').style.display = 'block';
        }
        this.openModal('treasury');
    },

    handleTreasurySubmit: function() {
        var self = this;
        var type = document.getElementById('treasury-type').value;
        var amount = document.getElementById('treasury-amount').value;
        var date = document.getElementById('treasury-date').value;
        var source = document.getElementById('treasury-source').value;
        var desc = document.getElementById('treasury-desc').value;
        var category = document.getElementById('treasury-category').value;

        if (type === 'deposit') {
            var payload = { amount: amount, date: date, source: source, description: desc };
            this.apiCall(API_BASE + '/treasury/deposit', 'POST', payload, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم تسجيل الايداع بنجاح | الرصيد: ' + result.balance + ' ج.م');
                document.getElementById('modal-treasury').classList.remove('open');
                self.loadTreasury();
            });
        } else {
            var payload = { amount: amount, date: date, description: desc, category: category };
            this.apiCall(API_BASE + '/treasury/withdraw', 'POST', payload, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم تسجيل المصروف بنجاح | الرصيد: ' + result.balance + ' ج.م');
                document.getElementById('modal-treasury').classList.remove('open');
                self.loadTreasury();
            });
        }
    },

    // ==================== HELPER METHODS ====================
    loadEmployeesList: function() {
        var self = this;
        this.apiCall(API_BASE + '/employees?status=active', 'GET', null, function(err, data) {
            if (err) return;
            self.employeesList = data;
            
            self.populateSelect('attendance-employee-id', self.employeesList);
            self.populateSelect('transaction-employee-id', self.employeesList);
        });
    },

    populateSelect: function(elementId, list) {
        var select = document.getElementById(elementId);
        if (!select) return;
        
        select.innerHTML = '<option value="">-- اختر الموظف --</option>';
        list.forEach(function(emp) {
            var opt = document.createElement('option');
            opt.value = emp.id;
            opt.innerText = emp.name;
            select.appendChild(opt);
        });
    },

    initTimePickers: function() {
        var btns = document.querySelectorAll('.time-ampm-btn');
        for (var i = 0; i < btns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var cur = btn.getAttribute('data-value');
                    var next = cur === 'AM' ? 'PM' : 'AM';
                    btn.setAttribute('data-value', next);
                    btn.textContent = next === 'AM' ? 'صباحاً' : 'مساءً';
                });
            })(btns[i]);
        }
    },

    openModal: function(modalId) {
        var modal = document.getElementById('modal-' + modalId);
        if (modal) {
            modal.classList.add('open');
        }
    },

    showToast: function(message, type) {
        type = type || 'success';
        var toast = document.getElementById('toast');
        toast.className = 'toast show ' + type;
        toast.innerText = message;
        
        setTimeout(function() {
            toast.classList.remove('show');
        }, 3500);
    },

    formatArabicDate: function(date) {
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('ar-EG', options);
    },

    // Convert 24h HH:MM to 12h display (hh:MM صباحاً/مساءً)
    to12h: function(time24) {
        if (!time24) return '-';
        var clean = time24.replace(/\s*(AM|PM|am|pm|صباحاً|مساءً)\s*$/, '');
        var parts = clean.split(':');
        var h = parseInt(parts[0], 10);
        if (isNaN(h)) return time24;
        var m = parts[1] || '00';
        var ampm = h < 12 ? 'صباحاً' : 'مساءً';
        var h12 = h % 12 || 12;
        return this.padZero(h12) + ':' + m + ' ' + ampm;
    },

    // ==================== SETTINGS TAB ====================

    getShiftName: function(shiftId) {
        for (var i = 0; i < this.shifts.length; i++) {
            if (String(this.shifts[i].id) === String(shiftId)) return this.shifts[i].name;
        }
        return shiftId === 'morning' ? 'صباحي' : shiftId === 'evening' ? 'مسائي' : shiftId;
    },

    loadSettingsTab: function() {
        var self = this;
        this.apiCall(API_BASE + '/settings', 'GET', null, function(err, data) {
            if (err || !data) return;
            document.getElementById('setting-overtime-threshold').value = data.overtime_threshold_hours || '8';
            document.getElementById('setting-company-name').value = data.company_name || '';
        });
        this.loadShifts();
        this.loadUsers();
        this.loadBackups();
    },

    loadShifts: function() {
        var self = this;
        this.apiCall(API_BASE + '/shifts', 'GET', null, function(err, data) {
            if (err) return;
            self.shifts = data || [];
            self.renderShiftsTable();
            self.populateShiftDropdowns();
        });
    },

    renderShiftsTable: function() {
        var tbody = document.getElementById('shifts-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        for (var i = 0; i < this.shifts.length; i++) {
            var s = this.shifts[i];
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td><input type="text" class="form-control shift-name-input" value="' + this.escapeHtml(s.name) + '"></td>' +
                '<td><input type="text" class="form-control date-input shift-start-input" value="' + this.escapeHtml(s.start_time) + '" placeholder="HH:MM"></td>' +
                '<td><input type="text" class="form-control date-input shift-end-input" value="' + this.escapeHtml(s.end_time) + '" placeholder="HH:MM"></td>' +
                '<td><button class="btn btn-danger btn-sm" onclick="app.deleteShiftRow(' + i + ')">🗑️</button></td>';
            tr.setAttribute('data-shift-id', s.id || '');
            tbody.appendChild(tr);
        }
    },

    escapeHtml: function(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    addShiftRow: function() {
        this.shifts.push({id: null, name: '', start_time: '', end_time: ''});
        this.renderShiftsTable();
    },

    deleteShiftRow: function(idx) {
        var shift = this.shifts[idx];
        if (shift && shift.id) {
            var self = this;
            this.apiCall(API_BASE + '/shifts/delete', 'POST', {id: shift.id}, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err && err.message) || 'لا يمكن حذف هذه الوردية لأنها مستخدمة من قبل الموظفين', 'error');
                    return;
                }
                self.shifts.splice(idx, 1);
                self.renderShiftsTable();
                self.populateShiftDropdowns();
                self.showToast('تم حذف الوردية');
            });
        } else {
            this.shifts.splice(idx, 1);
            this.renderShiftsTable();
        }
    },

    populateShiftDropdowns: function() {
        var selects = ['employee-shift', 'attendance-shift'];
        for (var s = 0; s < selects.length; s++) {
            var sel = document.getElementById(selects[s]);
            if (!sel) continue;
            var currentValue = sel.value;
            sel.innerHTML = '<option value="">-- اختر --</option>';
            for (var i = 0; i < this.shifts.length; i++) {
                var opt = document.createElement('option');
                opt.value = this.shifts[i].id;
                opt.textContent = this.shifts[i].name + ' (' + this.shifts[i].start_time + '-' + this.shifts[i].end_time + ')';
                sel.appendChild(opt);
            }
            if (currentValue) sel.value = currentValue;
        }
    },

    saveShiftSettings: function() {
        var self = this;

        var rows = document.querySelectorAll('#shifts-table-body tr');
        var shifts = [];
        for (var i = 0; i < rows.length; i++) {
            var id = rows[i].getAttribute('data-shift-id') || '';
            var name = rows[i].querySelector('.shift-name-input').value.trim();
            var start = rows[i].querySelector('.shift-start-input').value.trim();
            var end = rows[i].querySelector('.shift-end-input').value.trim();
            if (name && start && end) {
                var obj = {name: name, start_time: start, end_time: end};
                if (id) obj.id = parseInt(id, 10);
                shifts.push(obj);
            }
        }

        this.apiCall(API_BASE + '/shifts/save', 'POST', shifts, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'فشل في حفظ الورديات', 'error');
                return;
            }
            // Save non-shift settings too
            var otherSettings = {
                overtime_threshold_hours: document.getElementById('setting-overtime-threshold').value,
                company_name: document.getElementById('setting-company-name').value
            };
            self.apiCall(API_BASE + '/settings/save', 'POST', otherSettings, function(err2, result2) {
                if (err2 || !result2.success) {
                    self.showToast((err2 ? err2.message : '') || 'فشل في حفظ الإعدادات', 'error');
                    return;
                }
                self.loadShifts();
                self.showToast('تم حفظ الإعدادات بنجاح');
            });
        });
    },

    // ==================== USERS ====================
    loadUsers: function() {
        var self = this;
        this.apiCall(API_BASE + '/users', 'GET', null, function(err, data) {
            var tbody = document.querySelector('#users-table tbody');
            tbody.innerHTML = '';
            if (err || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا يوجد مستخدمون.</td></tr>';
                return;
            }
            data.forEach(function(user) {
                var tr = document.createElement('tr');
                var roleText = user.role === 'admin' ? 'مدير' : 'مستخدم';
                var statusText = user.is_active ? 'نشط' : 'معطل';
                var statusClass = user.is_active ? 'badge-success' : 'badge-danger';
                var lastLogin = user.last_login || '-';
                tr.innerHTML = '<td><strong>' + user.username + '</strong></td>' +
                               '<td>' + (user.display_name || '-') + '</td>' +
                               '<td>' + roleText + '</td>' +
                               '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
                               '<td>' + lastLogin + '</td>' +
                               '<td>' +
                               '<div class="action-buttons">' +
                               '<button class="action-btn" title="تعديل" onclick="app.editUser(' + user.id + ')">✏️</button>' +
                               '<button class="action-btn" title="إعادة تعيين كلمة المرور" onclick="app.openResetPassword(' + user.id + ', \'' + user.username + '\')">🔑</button>' +
                               '<button class="action-btn" title="حذف" onclick="app.deleteUser(' + user.id + ')">🗑️</button>' +
                               '</div>' +
                               '</td>';
                tbody.appendChild(tr);
            });
        });
    },

    openUserModal: function() {
        document.getElementById('form-user').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('user-modal-title').innerText = 'إضافة مستخدم جديد';
        document.getElementById('user-password-group').style.display = 'block';
        document.getElementById('user-password').required = true;
        this.openModal('user');
    },

    handleUserSubmit: function() {
        var self = this;
        var id = document.getElementById('user-id').value;
        var username = document.getElementById('user-username').value;
        var password = document.getElementById('user-password').value;
        var display_name = document.getElementById('user-display-name').value;
        var role = document.getElementById('user-role').value;

        var payload = { username: username, display_name: display_name, role: role };
        if (id) payload.id = id;
        if (password || !id) payload.password = password;

        var endpoint = id ? '/users/update' : '/users/add';
        this.apiCall(API_BASE + endpoint, 'POST', payload, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                return;
            }
            self.showToast(id ? 'تم تعديل المستخدم بنجاح' : 'تم إضافة المستخدم بنجاح');
            document.getElementById('modal-user').classList.remove('open');
            self.loadUsers();
        });
    },

    editUser: function(id) {
        var self = this;
        this.apiCall(API_BASE + '/users', 'GET', null, function(err, data) {
            if (err || !data) return;
            var user = null;
            for (var i = 0; i < data.length; i++) {
                if (data[i].id === id) { user = data[i]; break; }
            }
            if (!user) return;
            document.getElementById('user-id').value = user.id;
            document.getElementById('user-username').value = user.username;
            document.getElementById('user-display-name').value = user.display_name || '';
            document.getElementById('user-role').value = user.role;
            document.getElementById('user-password-group').style.display = 'none';
            document.getElementById('user-password').required = false;
            document.getElementById('user-modal-title').innerText = 'تعديل المستخدم';
            self.openModal('user');
        });
    },

    deleteUser: function(id) {
        var self = this;
        this.confirmAction('حذف مستخدم', 'هل تريد حذف هذا المستخدم من النظام؟', function() {
            self.apiCall(API_BASE + '/users/delete', 'POST', { id: id }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ ما', 'error');
                    return;
                }
                self.showToast('تم حذف المستخدم بنجاح');
                self.loadUsers();
            });
        });
    },

    openResetPassword: function(id, username) {
        document.getElementById('reset-user-id').value = id;
        document.getElementById('reset-user-name').innerText = 'إعادة تعيين كلمة المرور لـ: ' + username;
        document.getElementById('reset-password').value = '';
        this.openModal('reset-password');
    },

    handleResetPassword: function() {
        var self = this;
        var id = document.getElementById('reset-user-id').value;
        var password = document.getElementById('reset-password').value;
        if (!password) {
            self.showToast('أدخل كلمة المرور الجديدة', 'warning');
            return;
        }
        this.apiCall(API_BASE + '/users/reset-password', 'POST', { id: id, password: password }, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'حدث خطأ', 'error');
                return;
            }
            self.showToast('تم تحديث كلمة المرور بنجاح');
            document.getElementById('modal-reset-password').classList.remove('open');
        });
    },

    // ==================== BACKUP ====================
    loadBackups: function() {
        var self = this;
        this.apiCall(API_BASE + '/backup/list', 'GET', null, function(err, data) {
            var tbody = document.querySelector('#backups-table tbody');
            tbody.innerHTML = '';
            if (err || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">لا توجد نسخ احتياطية.</td></tr>';
                return;
            }
            data.forEach(function(b) {
                var tr = document.createElement('tr');
                var sizeMB = (b.size / (1024 * 1024)).toFixed(2);
                tr.innerHTML = '<td><strong>' + b.filename + '</strong></td>' +
                               '<td>' + sizeMB + ' MB</td>' +
                               '<td>' +
                               '<div class="action-buttons">' +
                               '<button class="action-btn" title="استعادة" onclick="app.restoreBackup(\'' + b.filename + '\')">♻️</button>' +
                               '<button class="action-btn" title="تحميل" onclick="app.downloadBackup(\'' + b.filename + '\')">📥</button>' +
                               '<button class="action-btn" title="حذف" onclick="app.deleteBackup(\'' + b.filename + '\')">🗑️</button>' +
                               '</div>' +
                               '</td>';
                tbody.appendChild(tr);
            });
        });
    },

    createBackup: function() {
        var self = this;
        this.apiCall(API_BASE + '/backup/create', 'POST', {}, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'فشل في إنشاء النسخة الاحتياطية', 'error');
                return;
            }
            self.showToast('تم إنشاء النسخة الاحتياطية بنجاح: ' + result.filename);
            self.loadBackups();
        });
    },

    restoreBackup: function(filename) {
        var self = this;
        this.confirmAction('استعادة نسخة احتياطية', 'هل تريد استعادة هذه النسخة الاحتياطية؟ سيتم استبدال جميع البيانات الحالية!', function() {
            self.apiCall(API_BASE + '/backup/restore', 'POST', { filename: filename }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'فشل في الاستعادة', 'error');
                    return;
                }
                self.showToast('تمت الاستعادة بنجاح! يُنصح بإعادة تحميل الصفحة.');
            });
        });
    },

    downloadBackup: function(filename) {
        window.location.href = API_BASE + '/backup/download?filename=' + encodeURIComponent(filename);
    },

    deleteBackup: function(filename) {
        var self = this;
        this.confirmAction('حذف نسخة احتياطية', 'هل تريد حذف هذه النسخة الاحتياطية نهائياً؟', function() {
            self.apiCall(API_BASE + '/backup/delete', 'POST', { filename: filename }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'حدث خطأ', 'error');
                    return;
                }
                self.showToast('تم حذف النسخة الاحتياطية');
                self.loadBackups();
            });
        });
    },

    uploadBackup: function() {
        var self = this;
        var fileInput = document.getElementById('backup-file-input');
        var shouldRestore = document.getElementById('backup-restore-now').checked;
        if (!fileInput.files || !fileInput.files[0]) {
            self.showToast('يرجى اختيار ملف النسخة الاحتياطية (.db)', 'warning');
            return;
        }
        var file = fileInput.files[0];
        if (!file.name.match(/\.db$/i)) {
            self.showToast('يجب أن يكون الملف بصيغة .db فقط', 'warning');
            return;
        }

        var formData = new FormData();
        formData.append('backup_file', file);
        formData.append('restore', shouldRestore ? 'true' : 'false');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/backup/upload', true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var result = JSON.parse(xhr.responseText);
                        if (result.success) {
                            var msg = 'تم رفع الملف بنجاح: ' + result.filename;
                            if (result.restored) {
                                msg += ' — تمت استعادة النظام! يُنصح بإعادة تحميل الصفحة.';
                            }
                            self.showToast(msg);
                            self.loadBackups();
                            fileInput.value = '';
                        } else {
                            self.showToast(result.error || 'حدث خطأ', 'error');
                        }
                    } catch(e) {
                        self.showToast('خطأ في الرد من الخادم', 'error');
                    }
                } else {
                    var errMsg = 'حدث خطأ أثناء الرفع';
                    try {
                        var errObj = JSON.parse(xhr.responseText);
                        errMsg = errObj.error || errMsg;
                    } catch(e) {}
                    self.showToast(errMsg, 'error');
                }
            }
        };
        xhr.send(formData);
    },

    // ==================== SYSTEM RESET ====================
    openResetSystemModal: function() {
        document.getElementById('reset-system-password').value = '';
        this.openModal('reset-system');
    },

    handleResetSystem: function() {
        var self = this;
        var password = document.getElementById('reset-system-password').value;
        if (!password) {
            self.showToast('أدخل كلمة مرور المدير', 'warning');
            return;
        }
        this.confirmAction('تأكيد إعادة تعيين النظام', 'هل أنت متأكد من إعادة تعيين النظام؟ سيتم حذف جميع سجلات الحضور، الخزنة، السلف، الخصومات، المكافآت، الرواتب، ومصروفات المصنع. كما سيتم إعادة تعيين كميات المخزون إلى صفر. لا يمكن التراجع عن هذه العملية!', function() {
            self.apiCall(API_BASE + '/settings/reset', 'POST', { password: password }, function(err, result) {
                if (err || !result.success) {
                    self.showToast((err ? err.message : '') || 'فشل في إعادة التعيين', 'error');
                    return;
                }
                self.showToast('تم إعادة تعيين النظام بنجاح!');
                document.getElementById('modal-reset-system').classList.remove('open');
                self.loadTab(self.activeTab);
                self.loadDashboardData();
            });
        });
    },

    // ==================== USER PERMISSIONS ====================
    loadPermissionsTab: function() {
        var self = this;
        this.apiCall(API_BASE + '/users', 'GET', null, function(err, data) {
            var select = document.getElementById('perm-user-select');
            select.innerHTML = '<option value="">-- اختر مستخدم --</option>';
            if (err || !data) return;
            data.forEach(function(u) {
                if (u.username === 'admin') return;
                var opt = document.createElement('option');
                opt.value = u.id;
                opt.innerText = (u.display_name || u.username) + ' (' + u.username + ')';
                select.appendChild(opt);
            });
            select.onchange = function() {
                self.loadUserPermissions(this.value);
            };
            var grid = document.getElementById('permissions-grid');
            grid.innerHTML = '<p class="text-muted">اختر مستخدم لعرض صلاحياته</p>';
        });
    },

    loadUserPermissions: function(userId) {
        var self = this;
        if (!userId) {
            document.getElementById('permissions-grid').innerHTML = '<p class="text-muted">اختر مستخدم لعرض صلاحياته</p>';
            return;
        }
        this.apiCall(API_BASE + '/users/permissions?user_id=' + userId, 'GET', null, function(err, data) {
            if (err || !data) {
                self.showToast('فشل في تحميل الصلاحيات', 'error');
                return;
            }
            self._currentPermUserId = data.user_id;
            self.renderPermissionsGrid(data.permissions);
        });
    },

    renderPermissionsGrid: function(permissions) {
        var tabs = [
            {key: 'dashboard', label: 'لوحة التحكم'},
            {key: 'employees', label: 'إدارة الموظفين'},
            {key: 'attendance', label: 'الحضور والانصراف'},
            {key: 'finance', label: 'السلف والمالية'},
            {key: 'payroll', label: 'حساب الرواتب'},
            {key: 'inventory', label: 'مخزون BVC'},
            {key: 'treasury', label: 'الخزنة'},
            {key: 'settings', label: 'الإعدادات'}
        ];
        var html = '<div class="perm-grid">';
        for (var i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            var checked = permissions[t.key] === true ? 'checked' : '';
            html += '<label class="perm-toggle">' +
                    '<span class="perm-label">' + t.label + '</span>' +
                    '<span class="toggle-switch">' +
                    '<input type="checkbox" class="toggle-input" data-perm-key="' + t.key + '" ' + checked + '>' +
                    '<span class="toggle-slider"></span>' +
                    '</span>' +
                    '</label>';
        }
        html += '</div>';
        document.getElementById('permissions-grid').innerHTML = html;
    },

    handleSavePermissions: function() {
        var self = this;
        var userId = self._currentPermUserId;
        if (!userId) {
            self.showToast('اختر مستخدم أولاً', 'warning');
            return;
        }
        var toggles = document.querySelectorAll('.toggle-input');
        var permissions = {};
        for (var i = 0; i < toggles.length; i++) {
            permissions[toggles[i].getAttribute('data-perm-key')] = toggles[i].checked;
        }
        this.apiCall(API_BASE + '/users/permissions', 'POST', {user_id: userId, permissions: permissions}, function(err, result) {
            if (err || !result.success) {
                self.showToast((err ? err.message : '') || 'فشل في حفظ الصلاحيات', 'error');
                return;
            }
            self.showToast('تم حفظ صلاحيات المستخدم بنجاح');
        });
    },

    // ==================== STOCK XLSX EXPORT/IMPORT ====================
    exportStockXLSX: function() {
        window.location.href = API_BASE + '/inventory/export-xlsx';
        this.showToast('جاري تصدير المخزون إلى ملف Excel...');
    },

    importStockXLSX: function(file) {
        var self = this;
        if (!file.name.match(/\.xlsx$/i)) {
            self.showToast('يجب أن يكون الملف بصيغة xlsx فقط', 'warning');
            return;
        }

        var formData = new FormData();
        formData.append('backup_file', file);

        self.showProgress('جاري رفع الملف...', 'قراءة بيانات الأصناف من الملف', -1);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/inventory/import-xlsx', true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var result = JSON.parse(xhr.responseText);
                        if (result.success) {
                            self.processImportBatch(result.upload_id, 0, result.total, 0, 0);
                        } else {
                            self.hideProgress();
                            self.showToast(result.error || 'حدث خطأ', 'error');
                        }
                    } catch(e) {
                        self.hideProgress();
                        self.showToast('خطأ في الرد من الخادم', 'error');
                    }
                } else {
                    self.hideProgress();
                    var errMsg = 'حدث خطأ أثناء رفع الملف';
                    try {
                        var errObj = JSON.parse(xhr.responseText);
                        errMsg = errObj.error || errMsg;
                    } catch(e) {}
                    self.showToast(errMsg, 'error');
                }
            }
        };
        xhr.send(formData);
    },

    processImportBatch: function(uploadId, processed, total, totalAdded, totalUpdated) {
        var self = this;
        var BATCH_SIZE = 50;
        var percent = total > 0 ? Math.round((processed / total) * 100) : 0;
        var msg = 'جاري تحديث السجلات... (' + processed + ' / ' + total + ')';
        self.updateProgress(percent, processed + ' / ' + total, msg);

        self.apiCall(API_BASE + '/inventory/import-process', 'POST', {
            upload_id: uploadId,
            processed: processed,
            batch_size: BATCH_SIZE
        }, function(err, result) {
            if (err || !result.success) {
                self.hideProgress();
                self.showToast((err ? err.message : '') || 'حدث خطأ أثناء الاستيراد', 'error');
                return;
            }
            totalAdded += result.batch_added;
            totalUpdated += result.batch_updated;

            if (result.done) {
                self.hideProgress();
                self.showToast('تم الاستيراد بنجاح! ' + totalAdded + ' صنف جديد، ' + totalUpdated + ' صنف محدّث (إجمالي: ' + result.total + ')');
                self.loadInventoryData();
                self.loadDashboardData();
            } else {
                setTimeout(function() {
                    self.processImportBatch(uploadId, result.processed, result.total, totalAdded, totalUpdated);
                }, 10);
            }
        });
    },

    // ==================== PROGRESS BAR HELPERS ====================
    showProgress: function(title, subtitle, percent) {
        document.getElementById('progress-title').innerText = title || 'جاري المعالجة...';
        document.getElementById('progress-subtitle').innerText = subtitle || 'يرجى الانتظار';
        document.getElementById('progress-status').innerText = '';
        var fill = document.getElementById('progress-bar-fill');
        if (percent < 0) {
            fill.className = 'progress-bar-fill indeterminate';
            fill.style.width = '100%';
            document.getElementById('progress-count').innerText = '';
            document.getElementById('progress-percent').innerText = '';
        } else {
            fill.className = 'progress-bar-fill';
            fill.style.width = (percent || 0) + '%';
            document.getElementById('progress-count').innerText = '';
            document.getElementById('progress-percent').innerText = (percent || 0) + '%';
        }
        this.openModal('progress');
    },

    updateProgress: function(percent, countText, statusText) {
        var fill = document.getElementById('progress-bar-fill');
        fill.className = 'progress-bar-fill';
        fill.style.width = percent + '%';
        if (countText) document.getElementById('progress-count').innerText = countText;
        document.getElementById('progress-percent').innerText = percent + '%';
        if (statusText) document.getElementById('progress-status').innerText = statusText;
    },

    hideProgress: function() {
        document.getElementById('modal-progress').classList.remove('open');
    }
};

// Global App Instance
document.addEventListener('DOMContentLoaded', function() {
    app.init();
});
