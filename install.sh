#!/bin/bash

set -e

# Directories and File paths
KEY_DIR="./keys"
KEY_FILE="$KEY_DIR/host.key"

# Create directory for SSH keys
mkdir -p "$KEY_DIR"

# Generate SSH Host Key
echo "[*] Generating SSH host key..."
ssh-keygen -t rsa -b 4096 -f "$KEY_FILE" -N ""  # Create an empty passphrase key

# Install system dependencies
echo "[*] Installing curl and other required packages..."
apt update && apt install -y curl build-essential

# Install NVM (Node Version Manager)
echo "[*] Installing NVM..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Source NVM to the current shell session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This will load NVM

# Install Node.js 18.x and set as default
echo "[*] Installing Node.js version 18..."
nvm install 18
nvm use 18
nvm alias default 18

# Install global npm packages
echo "[*] Installing global npm packages..."
npm install -g pm2

# Install dependencies from package.json
echo "[*] Installing npm dependencies..."
npm install

# Show the installed versions
echo "[*] SSH host key generated at: $KEY_FILE"
echo "[*] nvm version: $(nvm -v)"
echo "[*] Node.js version: $(node -v)"
echo "[*] npm version: $(npm -v)"
echo "[*] npm dependencies installed."
echo "[*] PM2 installed globally."
echo "[*] Done."

