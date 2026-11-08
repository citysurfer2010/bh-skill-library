# Arbeitsumgebung je User: opencode + Werkzeuge, laeuft komplett als uid 1000.
FROM node:24-trixie-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends \
      openssh-server openssh-sftp-server tini ca-certificates curl git tmux vim-tiny nano less \
      jq ripgrep gh procps python3 python3-venv python3-pip build-essential locales \
 && sed -i 's/# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen >/dev/null \
 && rm -rf /var/lib/apt/lists/*

# Das Basis-Image bringt "node" als uid 1000 mit; wir brauchen genau diese uid als "dev".
# Passwort "*" statt "!": ohne PAM wertet sshd "!" als gesperrtes Konto.
RUN userdel -r node 2>/dev/null || true \
 && useradd -u 1000 -m -s /bin/bash dev \
 && usermod -p '*' dev

ARG OPENCODE_VERSION=1.19.5
RUN npm install -g --no-fund --no-audit "opencode-ai@${OPENCODE_VERSION}" \
 && npm cache clean --force

COPY sshd_config /etc/devbox/sshd_config
COPY opencode.json /etc/opencode/opencode.json
COPY profile.sh /etc/profile.d/devbox.sh
COPY entrypoint.sh /usr/local/bin/devbox-entrypoint
RUN chmod 755 /usr/local/bin/devbox-entrypoint \
 && mkdir -p /etc/devbox/ssh /etc/devbox/llm \
 && cp -a /home/dev /etc/devbox/skel \
 && find / -xdev -type f -perm /6000 -exec chmod a-s {} + 2>/dev/null || true

USER 1000:1000
WORKDIR /home/dev
EXPOSE 2222
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/devbox-entrypoint"]
