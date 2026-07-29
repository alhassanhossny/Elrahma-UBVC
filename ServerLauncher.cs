using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Threading;

namespace BVCServer
{
    static class Program
    {
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool DestroyIcon(IntPtr handle);

        private static Process serverProcess = null;
        private static NotifyIcon trayIcon = null;
        private static bool isRunning = false;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            Mutex mutex = new Mutex(true, "BVCServerMutex_v1", out createdNew);
            if (!createdNew)
            {
                MessageBox.Show("خادم BVC يعمل بالفعل!", "BVC Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SetupTrayIcon();
            StartServer();
            Application.Run();

            StopServer();
            trayIcon.Visible = false;
            trayIcon.Dispose();
            mutex.ReleaseMutex();
        }

        static void StartServer()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string pythonExe = Path.Combine(baseDir, "python_embed", "python.exe");
                string serverScript = Path.Combine(baseDir, "server.py");

                if (!File.Exists(pythonExe))
                {
                    SetStatus(false, "Python not found");
                    return;
                }

                if (!File.Exists(serverScript))
                {
                    SetStatus(false, "server.py not found");
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
                if (serverProcess != null)
                {
                    Thread.Sleep(2000);
                    if (CheckServerRunning())
                    {
                        SetStatus(true, "Server running on port 8000");
                    }
                    else
                    {
                        SetStatus(false, "Server starting...");
                    }
                }
            }
            catch (Exception ex)
            {
                SetStatus(false, "Error: " + ex.Message);
            }
        }

        static bool CheckServerRunning()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:8000/");
                req.Timeout = 2000;
                req.Method = "GET";
                req.AllowAutoRedirect = false;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    resp.Close();
                }
                return true;
            }
            catch { return false; }
        }

        static void StopServer()
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
            SetStatus(false, "Server stopped");
        }

        static void SetStatus(bool running, string text)
        {
            isRunning = running;
            if (trayIcon != null)
            {
                trayIcon.Text = "BVC Server - " + text;

                Bitmap bmp = new Bitmap(16, 16);
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.Clear(running ? Color.FromArgb(22, 163, 74) : Color.FromArgb(220, 38, 38));
                    using (Pen whitePen = new Pen(Color.White, 1))
                    {
                        g.DrawEllipse(whitePen, 2, 2, 11, 11);
                    }
                    using (Brush brush = new SolidBrush(Color.White))
                    {
                        g.FillEllipse(brush, 4, 4, 7, 7);
                    }
                }

                IntPtr hIcon = bmp.GetHicon();
                Icon newIcon = Icon.FromHandle(hIcon);

                Icon oldIcon = trayIcon.Icon;
                trayIcon.Icon = newIcon;
                if (oldIcon != null) oldIcon.Dispose();
                DestroyIcon(hIcon);
                bmp.Dispose();
            }
        }

        static void SetupTrayIcon()
        {
            trayIcon = new NotifyIcon();
            trayIcon.Text = "BVC Server";
            trayIcon.Visible = true;

            SetStatus(false, "Starting...");

            ContextMenu menu = new ContextMenu();

            MenuItem startItem = new MenuItem("تشغيل الخادم");
            startItem.Click += delegate {
                if (!isRunning) StartServer();
            };

            MenuItem stopItem = new MenuItem("إيقاف الخادم");
            stopItem.Click += delegate {
                if (isRunning) StopServer();
            };

            MenuItem restartItem = new MenuItem("إعادة تشغيل الخادم");
            restartItem.Click += delegate {
                StopServer();
                Thread.Sleep(1000);
                StartServer();
            };

            MenuItem openItem = new MenuItem("فتح النظام في المتصفح");
            openItem.Click += delegate {
                try { Process.Start("http://localhost:8000"); } catch { }
            };

            MenuItem exitItem = new MenuItem("خروج");
            exitItem.Click += delegate {
                trayIcon.Visible = false;
                StopServer();
                Application.Exit();
            };

            menu.MenuItems.Add(startItem);
            menu.MenuItems.Add(stopItem);
            menu.MenuItems.Add(restartItem);
            menu.MenuItems.Add("-");
            menu.MenuItems.Add(openItem);
            menu.MenuItems.Add("-");
            menu.MenuItems.Add(exitItem);
            trayIcon.ContextMenu = menu;

            trayIcon.DoubleClick += delegate {
                try { Process.Start("http://localhost:8000"); } catch { }
            };
        }
    }
}
