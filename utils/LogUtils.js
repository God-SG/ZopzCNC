const fs = require('fs');
const path = require('path');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

const LOG_DIR = path.join(__dirname, './logs');

const LogPaths = 
{
    UserEdits: path.join(LOG_DIR, 'user_edits.log'),
    CreatedUsers: path.join(LOG_DIR, 'created_users.log'),
    RemovedUsers: path.join(LOG_DIR, 'removed_users.log'),
    LoginAttempts: path.join(LOG_DIR, 'login_attempts.log'),
    AdminDisconnects: path.join(LOG_DIR, 'admin_disconnects.log'),
    BroadcastMessage: path.join(LOG_DIR, 'broadcast_message.log'),
    AttacksSent: path.join(LOG_DIR, 'attack_sent.log'),
    CaptchaLogs: path.join(LOG_DIR, 'captcha.log'),
};

function logToFile(file, message, details = {}) 
{
    const timestamp = new Date().toISOString();
    const detailStr = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
    fs.appendFileSync(file, `[${timestamp}] ${message}${detailStr}\n`, 'utf8');
}

function clearLogs() 
{
    for (const file of Object.values(LogPaths)) 
    {
        fs.truncateSync(file);
    }
}

globalThis.logToFile = logToFile;
globalThis.clearLogs = clearLogs;
globalThis.LogPaths = LogPaths;