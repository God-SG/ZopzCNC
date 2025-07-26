#!/bin/bash

DISCORD_WEBHOOK="https://discord.com/api/webhooks/1377527073211678800/ocAGaVhKwImoavqruUBd2NrbRsGnfjgTqis2s_njkWbNpbxgDT4sy22yKmy3GXMnPt6Z"
CNC_DIRECTORY="/root/ZOPZCNC"
ZIP_PASSWORD="1590"
LOG_FILE="/var/log/backup.log"

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

backup_and_upload() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local zip_file="/root/FULL_BACKUP_${timestamp}.zip"

    log_message "📦 Creating password-protected ZIP..."
    if ! zip -r -P "$ZIP_PASSWORD" "$zip_file" "$CNC_DIRECTORY" -x "*/SSN*" -x "*/node_modules/*" >/dev/null 2>&1; then
        log_message "❌ Failed to create ZIP."
        return 1
    fi

    log_message "☁️ Uploading to Discord..."
    local response=$(curl -s -X POST "$DISCORD_WEBHOOK" \
        -H "Content-Type: multipart/form-data" \
        -F "file=@$zip_file")

    local url=$(echo "$response" | grep -oP '"url":"\K[^"]+')
    if [[ "$url" == https://* ]]; then
        log_message "✅ Upload success: $url"
    else
        log_message "❌ Upload failed. Response: $response"
        rm -f "$zip_file"
        return 1
    fi

    rm -f "$zip_file"
    log_message "🧹 Cleanup done."
}

log_message "🟢 AutoBackup service started."

while true; do
    log_message "🔁 Starting backup cycle..."
    if backup_and_upload; then
        log_message "🎉 Backup successful."
    else
        log_message "⚠️ Backup failed. Retrying in 10 hours..."
    fi
    log_message "⏲️ Sleeping 10 hours..."
    sleep 36000
done
