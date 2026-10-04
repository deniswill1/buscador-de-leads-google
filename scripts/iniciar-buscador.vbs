' Aberto pelo link buscador-leads:// do CRM do planner.
' Liga o buscador (npm start) numa janela minimizada, se ele ainda nao estiver rodando.
Option Explicit
Dim fso, shell, pasta, http, ligado
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

ligado = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 1000, 1000, 1000, 1000
http.open "GET", "http://localhost:3000/api/health", False
http.send
If Err.Number = 0 Then ligado = (http.Status = 200)
On Error GoTo 0
If ligado Then WScript.Quit

shell.CurrentDirectory = pasta
' cmd /k deixa a janela aberta se o servidor parar com erro, para dar para ler a mensagem.
shell.Run "cmd /k title Buscador de Leads && npm start", 7, False
