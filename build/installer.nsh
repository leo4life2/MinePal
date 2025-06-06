!macro customInit
  ; Add outbound allow rule for MinePal.exe (Private & Public)
  ExecWait 'netsh advfirewall firewall add rule name="MinePal"^
    program="$INSTDIR\\MinePal.exe" dir=out action=allow profile=any'
!macroend