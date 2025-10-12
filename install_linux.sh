#!/usr/bin/sh
# Installation script for minepal
# Don't use when you're actively recompiling the app over and over again
source /etc/os-release
APPIMAGE=$(/usr/bin/ls | grep -i Minepal | grep .AppImage)
sudo mv "$APPIMAGE" /usr/local/bin/minepal
case "$ID $ID_LIKE" in
    *fedora*) sudo dnf install -y xdg-utils ;;
    *arch*)   sudo pacman --noconfirm -S xdg-utils ;;
    *debian*) sudo apt install -y xdg-utils ;;
esac
mkdir -p ~/.local/share/applications
cat > ~/.local/share/applications/minepal.desktop <<EOF
[Desktop Entry]
Name=MinePal
Exec=/usr/local/bin/minepal %u
Type=Application
Terminal=false
MimeType=x-scheme-handler/minepal;
Categories=Utility;
EOF
cat > minepal-protocol.xml <<EOF
<?xml version="1.0"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="x-scheme-handler/minepal">
    <comment>MinePal custom protocol</comment>
    <glob pattern="minepal:*"/>
  </mime-type>
</mime-info>
EOF
sudo update-desktop-database /usr/share/applications/
xdg-mime install minepal-protocol.xml
xdg-mime default minepal.desktop x-scheme-handler/minepal
[ "$(xdg-mime query default x-scheme-handler/minepal)" = "minepal.desktop" ] && \
    rm -rf 'minepal-protocol.xml'
    echo "Installation successful. You should now be able to login. Enjoy!"
