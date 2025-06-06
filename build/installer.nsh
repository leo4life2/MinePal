!macro customInit
  ; Add outbound allow-rule so the Windows firewall never blocks MinePal
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="MinePal" program="$INSTDIR\MinePal.exe" dir=out action=allow profile=any'
!macroend