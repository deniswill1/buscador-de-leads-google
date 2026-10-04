# Registra o link buscador-leads:// no Windows (so para o seu usuario, sem precisar de administrador).
# Depois disso, o botao "Buscar leads" do CRM liga o buscador sozinho quando ele estiver desligado.
$vbs = Join-Path $PSScriptRoot 'iniciar-buscador.vbs'
$key = 'HKCU:\Software\Classes\buscador-leads'
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $key -Name '(Default)' -Value 'URL:Buscador de Leads'
Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$key\shell\open\command" -Name '(Default)' -Value "wscript.exe `"$vbs`""
Write-Host 'Pronto. O CRM agora consegue ligar o buscador sozinho.'
Write-Host 'Na primeira vez o navegador pergunta se pode abrir o link: marque "Sempre permitir" e confirme.'
