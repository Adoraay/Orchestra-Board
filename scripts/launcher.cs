// Lanceur d'Orchestra sans fenêtre de terminal : reconstruit l'interface (vite build) puis ouvre Electron.
// launcher.exe doit rester à la racine du projet. Recompiler : npm run build:launcher
// Pour développer avec rechargement à chaud, utiliser plutôt « npm run dev ».
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Launcher
{
    const string Title = "Orchestra";

    [STAThread]
    static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string electron = Path.Combine(root, @"node_modules\electron\dist\electron.exe");

        if (!File.Exists(electron))
        {
            MessageBox.Show("Electron est introuvable. Lance d'abord « npm install » dans :\n" + root, Title,
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }

        // npm est un script .cmd : on passe par cmd.exe, fenêtre cachée, sortie dans launcher.log.
        var build = new ProcessStartInfo("cmd.exe", "/c npm run build > launcher.log 2>&1")
        {
            WorkingDirectory = root,
            CreateNoWindow = true,
            UseShellExecute = false,
        };
        using (var process = Process.Start(build))
        {
            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                MessageBox.Show("La construction de l'interface a échoué.\nDétails dans launcher.log", Title,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return process.ExitCode;
            }
        }

        Process.Start(new ProcessStartInfo(electron, ".") { WorkingDirectory = root, UseShellExecute = false });
        return 0;
    }
}
