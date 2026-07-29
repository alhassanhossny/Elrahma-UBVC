using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Threading;
using Microsoft.Win32;

namespace BVCWinForms
{
    static class Program
    {
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool DestroyIcon(IntPtr handle);

        [DllImport("wininet.dll", SetLastError = true)]
        private static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

        private const int INTERNET_OPTION_SETTINGS_CHANGED = 39;
        private const int INTERNET_OPTION_REFRESH = 37;

        private static Process serverProcess = null;
        internal static NotifyIcon trayIcon = null;
        private static MainForm mainForm = null;
        private static string logPath;

        internal static void Log(string msg)
        {
            try
            {
                string line = DateTime.Now.ToString("HH:mm:ss.fff") + " | " + msg + Environment.NewLine;
                File.AppendAllText(logPath, line);
            }
            catch { }
        }

        [STAThread]
        static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            logPath = Path.Combine(baseDir, "bvc_startup.log");

            try { File.Delete(logPath); } catch { }

            Log("=== BVC WinForms Starting ===");
            Log("BaseDir: " + baseDir);

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            Mutex mutex = new Mutex(true, "BVCWinFormsMutex_v1", out createdNew);
            if (!createdNew)
            {
                MessageBox.Show("النظام يعمل بالفعل!", "BVC الرحمة", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            Log("Setting IE emulation + disabling CRL...");
            SetIeEmulation();

            Log("Starting Python server...");
            StartServer();

            Log("Creating MainForm...");
            mainForm = new MainForm();
            SetupTrayIcon();

            Log("Entering message loop...");
            Application.Run(mainForm);

            StopServer();
            trayIcon.Visible = false;
            trayIcon.Dispose();
            mutex.ReleaseMutex();
            Log("=== BVC WinForms Exiting ===");
        }

        static void SetIeEmulation()
        {
            try
            {
                string appName = Process.GetCurrentProcess().ProcessName + ".exe";

                string ieKeyPath = @"SOFTWARE\Microsoft\Internet Explorer\Main\FeatureControl\FEATURE_BROWSER_EMULATION";
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(ieKeyPath))
                {
                    if (key != null)
                        key.SetValue(appName, 11001, RegistryValueKind.DWord);
                }

                try
                {
                    string internetSettings = @"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
                    using (RegistryKey key = Registry.CurrentUser.CreateSubKey(internetSettings))
                    {
                        if (key != null)
                        {
                            key.SetValue("CertificateRevocation", 0, RegistryValueKind.DWord);
                            key.SetValue("CheckCertRevocation", 0, RegistryValueKind.DWord);
                        }
                    }
                }
                catch { }

                try
                {
                    string certPolicy = @"SOFTWARE\Policies\Microsoft\SystemCertificates\AuthRoot\AutoUpdate";
                    using (RegistryKey key = Registry.LocalMachine.CreateSubKey(certPolicy))
                    {
                        if (key != null)
                        {
                            key.SetValue("DisableRootAutoUpdate", 1, RegistryValueKind.DWord);
                            key.SetValue("EnableWU", 0, RegistryValueKind.DWord);
                        }
                    }
                }
                catch { }

                try
                {
                    string winHttp = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings\Wpad";
                    using (RegistryKey key = Registry.CurrentUser.CreateSubKey(winHttp))
                    {
                        if (key != null)
                            key.SetValue("WpadOverride", 1, RegistryValueKind.DWord);
                    }
                }
                catch { }

                try
                {
                    InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
                    InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
                }
                catch { }

                Log("IE emulation set OK");
            }
            catch (Exception ex) { Log("SetIeEmulation error: " + ex.Message); }
        }

        static void StartServer()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string pythonExe = Path.Combine(baseDir, "python_embed", "python.exe");
                string serverScript = Path.Combine(baseDir, "server.py");

                Log("Python exe: " + pythonExe + " exists=" + File.Exists(pythonExe));
                Log("Server script: " + serverScript + " exists=" + File.Exists(serverScript));

                if (!File.Exists(pythonExe))
                {
                    MessageBox.Show("لم يتم العثور على Python!\nالمسار المتوقع:\n" + pythonExe,
                        "BVC الرحمة - خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                if (!File.Exists(serverScript))
                {
                    MessageBox.Show("لم يتم العثور على server.py!\nالمسار المتوقع:\n" + serverScript,
                        "BVC الرحمة - خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = pythonExe;
                psi.Arguments = "\"" + serverScript + "\"";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                serverProcess = Process.Start(psi);
                Log("Python process started, PID=" + (serverProcess != null ? serverProcess.Id.ToString() : "null"));
            }
            catch (Exception ex)
            {
                Log("StartServer error: " + ex.Message);
                MessageBox.Show("خطأ في تشغيل الخادم:\n" + ex.Message,
                    "BVC الرحمة - خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void SetupTrayIcon()
        {
            string logoPath = Path.Combine(Application.StartupPath, "logo.png");
            Icon logoIcon;
            if (File.Exists(logoPath))
            {
                using (Bitmap src = new Bitmap(logoPath))
                {
                    IntPtr hIcon = src.GetHicon();
                    logoIcon = (Icon)Icon.FromHandle(hIcon).Clone();
                    DestroyIcon(hIcon);
                }
            }
            else
            {
                Bitmap bmp = new Bitmap(16, 16);
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.FromArgb(13, 148, 136));
                    using (Pen whitePen = new Pen(Color.White, 1))
                    {
                        g.DrawRectangle(whitePen, 1, 1, 13, 13);
                    }
                    using (Font fnt = new Font("Arial", 7, FontStyle.Bold))
                    {
                        g.DrawString("B", fnt, Brushes.White, 3, 3);
                    }
                }
                IntPtr hIcon = bmp.GetHicon();
                logoIcon = (Icon)Icon.FromHandle(hIcon).Clone();
                DestroyIcon(hIcon);
                bmp.Dispose();
            }

            trayIcon = new NotifyIcon();
            trayIcon.Icon = logoIcon;
            trayIcon.Text = "نظام BVC الرحمة";
            trayIcon.Visible = true;

            ContextMenu menu = new ContextMenu();

            MenuItem showItem = new MenuItem("إظهار النافذة");
            showItem.Click += delegate { mainForm.Show(); mainForm.WindowState = FormWindowState.Normal; mainForm.BringToFront(); };

            MenuItem restart = new MenuItem("إعادة تشغيل الخادم");
            restart.Click += delegate {
                StopServer();
                Thread.Sleep(1000);
                StartServer();
                Thread.Sleep(2000);
                mainForm.RestartServerPoll();
            };

            MenuItem exit = new MenuItem("إيقاف النظام والخروج");
            exit.Click += delegate {
                trayIcon.Visible = false;
                StopServer();
                Application.Exit();
            };

            menu.MenuItems.Add(showItem);
            menu.MenuItems.Add(restart);
            menu.MenuItems.Add("-");
            menu.MenuItems.Add(exit);
            trayIcon.ContextMenu = menu;

            trayIcon.DoubleClick += delegate { mainForm.Show(); mainForm.WindowState = FormWindowState.Normal; mainForm.BringToFront(); };
        }

        internal static void StopServer()
        {
            if (serverProcess != null)
            {
                try
                {
                    if (!serverProcess.HasExited)
                    {
                        serverProcess.Kill();
                        serverProcess.WaitForExit(3000);
                    }
                    serverProcess.Dispose();
                }
                catch { }
                serverProcess = null;
            }
        }

        internal static bool CheckServerReady()
        {
            // Method 1: TCP socket to 127.0.0.1:8000 (fast, bypasses HTTP/firewall issues)
            try
            {
                using (TcpClient tcp = new TcpClient())
                {
                    var result = tcp.BeginConnect("127.0.0.1", 8000, null, null);
                    bool connected = result.AsyncWaitHandle.WaitOne(2000);
                    if (connected && tcp.Connected)
                    {
                        tcp.EndConnect(result);
                        Log("CheckServer: TCP 127.0.0.1:8000 OK");
                        return true;
                    }
                    Log("CheckServer: TCP 127.0.0.1:8000 FAILED");
                }
            }
            catch (Exception ex) { Log("CheckServer TCP error: " + ex.Message); }

            // Method 2: Fallback to HTTP
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8000/");
                req.Timeout = 3000;
                req.Method = "GET";
                req.AllowAutoRedirect = false;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    resp.Close();
                }
                Log("CheckServer: HTTP 127.0.0.1:8000 OK");
                return true;
            }
            catch (Exception ex) { Log("CheckServer HTTP error: " + ex.Message); }

            // Method 3: Check if python process is alive
            if (serverProcess != null)
            {
                try
                {
                    if (!serverProcess.HasExited)
                    {
                        Log("CheckServer: Python PID " + serverProcess.Id + " alive but port not responding");
                    }
                    else
                    {
                        Log("CheckServer: Python PID " + serverProcess.Id + " EXITED with code " + serverProcess.ExitCode);
                    }
                }
                catch { }
            }
            else
            {
                Log("CheckServer: serverProcess is NULL");
            }

            return false;
        }

        internal static string GetLogPath()
        {
            return logPath;
        }
    }

    class MainForm : Form
    {
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool DestroyIcon(IntPtr handle);

        private WebBrowser browser;
        private Panel loadingPanel;
        private Label statusLabel;
        private Label titleLabel;
        private Label diagLabel;
        private System.Windows.Forms.Timer pollTimer;
        private int pollCount = 0;
        private bool browserCreated = false;
        private bool polling = false;

        public MainForm()
        {
            Program.Log("MainForm constructor start");

            this.Text = "BVC الرحمة - نظام إدارة الشركة";
            this.Width = 1200;
            this.Height = 800;
            this.MinimumSize = new Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;

            string logoPath = Path.Combine(Application.StartupPath, "logo.png");
            if (File.Exists(logoPath))
            {
                using (Bitmap src = new Bitmap(logoPath))
                {
                    IntPtr hIcon = src.GetHicon();
                    this.Icon = (Icon)Icon.FromHandle(hIcon).Clone();
                    DestroyIcon(hIcon);
                }
            }
            else
            {
                Bitmap iconBmp = new Bitmap(16, 16);
                using (Graphics g = Graphics.FromImage(iconBmp))
                {
                    g.Clear(Color.FromArgb(13, 148, 136));
                }
                IntPtr hIcon = iconBmp.GetHicon();
                this.Icon = (Icon)Icon.FromHandle(hIcon).Clone();
                DestroyIcon(hIcon);
                iconBmp.Dispose();
            }

            this.Resize += MainForm_Resize;
            this.FormClosing += MainForm_FormClosing;

            BuildLoadingScreen();

            pollTimer = new System.Windows.Forms.Timer();
            pollTimer.Interval = 1500;
            pollTimer.Tick += PollTimer_Tick;
            pollTimer.Start();
            Program.Log("MainForm constructor done, pollTimer started");
        }

        void BuildLoadingScreen()
        {
            loadingPanel = new Panel();
            loadingPanel.Dock = DockStyle.Fill;
            loadingPanel.BackColor = Color.FromArgb(248, 250, 252);

            titleLabel = new Label();
            titleLabel.Text = "BVC الرحمة";
            titleLabel.Font = new Font("Arial", 22, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(13, 148, 136);
            titleLabel.AutoSize = true;
            titleLabel.BackColor = Color.Transparent;

            statusLabel = new Label();
            statusLabel.Text = "جاري تحميل النظام...";
            statusLabel.Font = new Font("Arial", 12);
            statusLabel.ForeColor = Color.FromArgb(100, 116, 139);
            statusLabel.AutoSize = true;
            statusLabel.BackColor = Color.Transparent;

            diagLabel = new Label();
            diagLabel.Text = "";
            diagLabel.Font = new Font("Consolas", 8);
            diagLabel.ForeColor = Color.FromArgb(148, 163, 184);
            diagLabel.AutoSize = true;
            diagLabel.BackColor = Color.Transparent;
            diagLabel.MaximumSize = new Size(600, 0);

            loadingPanel.Controls.Add(titleLabel);
            loadingPanel.Controls.Add(statusLabel);
            loadingPanel.Controls.Add(diagLabel);

            loadingPanel.Paint += (s, e) =>
            {
                int centerX = loadingPanel.Width / 2;
                int centerY = loadingPanel.Height / 2;

                titleLabel.Location = new Point(centerX - titleLabel.Width / 2, centerY - 80);
                statusLabel.Location = new Point(centerX - statusLabel.Width / 2, centerY - 10);
                diagLabel.Location = new Point(centerX - diagLabel.Width / 2, centerY + 30);

                using (Pen pen = new Pen(Color.FromArgb(13, 148, 136), 3))
                {
                    int size = 40;
                    e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                    e.Graphics.DrawArc(pen, centerX - size / 2, centerY - size / 2 - 50, size, size, -90, 120);
                }
            };

            this.Controls.Add(loadingPanel);
            loadingPanel.BringToFront();
        }

        void UpdateDiag()
        {
            try
            {
                string logContent = "";
                if (File.Exists(Program.GetLogPath()))
                {
                    string[] lines = File.ReadAllLines(Program.GetLogPath());
                    int start = Math.Max(0, lines.Length - 6);
                    for (int i = start; i < lines.Length; i++)
                        logContent += lines[i] + "\n";
                }
                diagLabel.Text = logContent.TrimEnd('\n');
                loadingPanel.Invalidate();
            }
            catch { }
        }

        void CreateBrowser()
        {
            if (browserCreated) return;
            browserCreated = true;
            Program.Log("Creating WebBrowser control...");

            browser = new WebBrowser();
            browser.Dock = DockStyle.Fill;
            browser.ScriptErrorsSuppressed = true;
            browser.IsWebBrowserContextMenuEnabled = false;
            browser.AllowWebBrowserDrop = false;
            browser.DocumentTitleChanged += Browser_DocumentTitleChanged;
            this.Controls.Add(browser);
            browser.BringToFront();

            if (loadingPanel != null)
            {
                this.Controls.Remove(loadingPanel);
                loadingPanel.Dispose();
                loadingPanel = null;
            }
            Program.Log("WebBrowser created and shown");
        }

        void PollTimer_Tick(object sender, EventArgs e)
        {
            if (browserCreated || polling) return;

            pollCount++;

            if (pollCount % 3 == 0)
            {
                string dots = new string('.', (pollCount / 3) % 4 + 1);
                statusLabel.Text = "جاري تحميل النظام" + dots;
                UpdateDiag();
            }

            if (pollCount >= 120)
            {
                pollTimer.Stop();
                statusLabel.Text = "الخادم لم يستجب - أعد تشغيل النظام";
                statusLabel.ForeColor = Color.FromArgb(220, 38, 38);
                UpdateDiag();
                Program.trayIcon.ShowBalloonTip(5000, "BVC الرحمة - تعطل",
                    "الخادم لم يستجب. أعد تشغيل النظام من قائمة الأيقونة.", ToolTipIcon.Error);
                return;
            }

            polling = true;
            ThreadPool.QueueUserWorkItem(_ =>
            {
                bool ready = Program.CheckServerReady();
                this.BeginInvoke((MethodInvoker)delegate
                {
                    polling = false;
                    if (ready && !browserCreated)
                    {
                        pollTimer.Stop();
                        CreateBrowser();
                        browser.Navigate("http://127.0.0.1:8000");
                        Program.trayIcon.ShowBalloonTip(3000, "BVC الرحمة",
                            "الخادم جاهز - تم تحميل النظام بنجاح.", ToolTipIcon.Info);
                    }
                    UpdateDiag();
                });
            });
        }

        void Browser_DocumentTitleChanged(object sender, EventArgs e)
        {
            if (browser != null && !string.IsNullOrEmpty(browser.DocumentTitle))
                this.Text = browser.DocumentTitle + " - BVC الرحمة";
        }

        void MainForm_Resize(object sender, EventArgs e) { }

        void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.WindowState = FormWindowState.Minimized;
                this.Hide();
                if (Program.trayIcon != null)
                    Program.trayIcon.ShowBalloonTip(2000, "BVC الرحمة", "لا يزال النظام يعمل في الخلفية.", ToolTipIcon.Info);
            }
        }

        public void RestartServerPoll()
        {
            Program.Log("RestartServerPoll called");
            if (browser != null)
            {
                this.Controls.Remove(browser);
                browser.Dispose();
                browser = null;
            }
            browserCreated = false;
            pollCount = 0;

            if (loadingPanel == null)
                BuildLoadingScreen();
            else
                loadingPanel.Visible = true;

            statusLabel.Text = "جاري تحميل النظام...";
            statusLabel.ForeColor = Color.FromArgb(100, 116, 139);
            pollTimer.Start();
        }

        public void ReloadPage()
        {
            Program.Log("ReloadPage called");
            if (!browserCreated)
                CreateBrowser();
            browser.Navigate("http://127.0.0.1:8000");
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                if (pollTimer != null) { pollTimer.Stop(); pollTimer.Dispose(); pollTimer = null; }
                if (browser != null) { browser.Dispose(); browser = null; }
                if (loadingPanel != null) { loadingPanel.Dispose(); loadingPanel = null; }
            }
            base.Dispose(disposing);
        }
    }
}
