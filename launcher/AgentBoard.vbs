' Lance Agent Board sans fenetre de terminal :
' reconstruit l'interface (vite build) puis ouvre Electron sur dist/.
' Pour developper avec rechargement a chaud, utiliser plutot "npm run dev".
Option Explicit

Dim shell, fso, root, electron, code
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
electron = root & "\node_modules\electron\dist\electron.exe"
shell.CurrentDirectory = root

If Not fso.FileExists(electron) Then
  MsgBox "Electron est introuvable. Lance d'abord ""npm install"" dans :" & vbCrLf & root, vbExclamation, "Agent Board"
  WScript.Quit 1
End If

' 0 = fenetre cachee, True = attendre la fin
code = shell.Run("cmd /c npm run build > launcher\build.log 2>&1", 0, True)
If code <> 0 Then
  MsgBox "La construction de l'interface a echoue." & vbCrLf & "Details dans launcher\build.log", vbCritical, "Agent Board"
  WScript.Quit code
End If

shell.Run """" & electron & """ .", 1, False
