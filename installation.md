# Installation guide

This is an ultimate guide to setup your system to make MinePal work correctly

> [!NOTE]
> This guide implies that you have already downloaded the app. If not - you can [download it from the official website](https://minepal.net/) or [build it from source](README.md#building-from-source)

## Windows & Mac

This is your lucky day! No extra installation needed. Just open the app and have a nice time playing with your MinePal!

## Linux

Well, bad luck, yet another day of setting up your system for a new app. Well, at least it's better then setting up wine, right?

### Step 1. Moving it to /bin

First of all you need to make it persistent and available from any point of your system. Just navigate to your Download/dist directory and move it to `/bin` directory

```sh
sudo mv Minepal-*.*.*.AppImage /bin/minepal
```

> [!NOTE]
> If you're actively rebuilding AppImage and work with source code a lot - you may found it easier to create a symbolic link. Just use `sudo ln -s /absolute/path/to/project/folder/dist/Minepal-*.*.*.AppImage /bin/minepal` command to make it work

### Step 2. Setting up xdg

Then you need to setup xdg (x desktop group) so urls from the website (auth and importing pals) will be transferred to app. This is pretty simple: all we really need is create a desktop entery, register protocol and connect protocol to an entery.

#### Step 2.1 Insalling xdg-tools
First of all make sure that `xdg-tools` are installed
```sh
sudo apt install xdg-utils  # Debian/Ubuntu
sudo dnf install xdg-utils  # Fedora
sudo pacman -S xdg-utils    # Arch
```


#### Step 2.2 Creating desktop entry
Then you need to create a desktop entery for the app. You can either put it into `~/.local/share/applications/` for user-specific or `/usr/share/applications/` for system-wide registering. Second variant is recommended because some browsers, especially if installed via flatpack or snap doesn't recognize user-specific `desktop` files. Name it `minepal.desktop` and fill it with next content:
```ini
[Desktop Entry]
Name=MinePal
Exec=/bin/minepal %u
Type=Application
Terminal=false
MimeType=x-scheme-handler/minepal;
Categories=Utility;
```

Then update your desktop database
```sh
update-desktop-database ~/.local/share/applications  # For user-specific
update-desktop-database /usr/share/applications/  # For system-wide
```

#### Step 2.3 Registering the MIME Type
Then you need to create MIME Type and register it. Create file `minepal-protocol.xml` with next content:
```xml
<?xml version="1.0"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="x-scheme-handler/minepal">
    <comment>MinePal custom protocol</comment>
    <glob pattern="minepal:*"/>
  </mime-type>
</mime-info>
```

And instill it using `xdg-mime`
```sh
xdg-mime install minepal-protocol.xml
```

#### Step 2.4 Linking MIME Type and app

Run this command to link minepal schema and minepal so it will open the app once to handle the url
```sh
xdg-mime default minepal.desktop x-scheme-handler/minepal
```

Now you can verify registration. If this command
```sh
xdg-mime query default x-scheme-handler/minepal
```
returns `minepal.desktop`, then registration is complete

**And after that you're ready to play! Have fun with your minepals!**