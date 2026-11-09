# The root file system is read-only: everything self-installed lands in the home.
export LANG=en_US.UTF-8
export NPM_CONFIG_PREFIX="$HOME/.local"
export PIP_USER=1
export PATH="$HOME/.local/bin:/etc/devbox/skills/bh-github/scripts:/etc/devbox/skills/bh-nas/scripts:$PATH"
