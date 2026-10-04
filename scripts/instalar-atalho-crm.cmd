@echo off
rem Registra o link buscador-leads:// no Windows (so para o seu usuario, sem administrador).
rem Depois disso, o botao "Buscar leads" do CRM liga o buscador sozinho quando ele estiver desligado.
reg add "HKCU\Software\Classes\buscador-leads" /ve /d "URL:Buscador de Leads" /f >nul
reg add "HKCU\Software\Classes\buscador-leads" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\buscador-leads\shell\open\command" /ve /d "wscript.exe \"%~dp0iniciar-buscador.vbs\"" /f >nul
if errorlevel 1 (
  echo Nao foi possivel registrar o atalho.
) else (
  echo Pronto. O CRM agora consegue ligar o buscador sozinho.
  echo Na primeira busca o navegador pergunta se pode abrir o link: marque "Sempre permitir" e confirme.
)
echo.
pause
