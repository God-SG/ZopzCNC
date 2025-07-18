const os = require('os');
const fs = require('fs');
const dns = require('dns');
const WebSocket = require('ws');

// Force DNS lookup to IPv4 only
const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    options.family = 4; // Force IPv4
    return originalLookup.call(dns, hostname, options, callback);
};

if (os.platform() !== 'linux') 
{
    console.error('This script must be run on a Linux server.');
    process.exit(1);
}

eval(fs.readFileSync('./Entry.js', 'utf8'));
eval(fs.readFileSync('./utils/json-stuff.js', 'utf8'));
eval(fs.readFileSync('./utils/hardware.js', 'utf8'));
eval(fs.readFileSync('./utils/Base64.js', 'utf8'));

const config = JSON.parse(fs.readFileSync('./configs/main.json'));

let STARTED = false;
const MAX_RETRIES = 4;

const FATAL_ERRORS = 
[
    'invalid_key',
    'key_banned',
    'server_slots_exceeded',
    'already_active',
    'key_expired'
];

let currentSocket = null;
let heartbeatInterval = null;

async function connectClient(key, retry = 0) 
{
    if (currentSocket) 
    {
        try 
        {
            currentSocket.terminate();
        }
         catch (_) {}
        currentSocket = null;
    }

    if (heartbeatInterval)
    {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    let rejected = false;
    const ws = new WebSocket('wss://legit.zopz-api.com/ws');
    currentSocket = ws;

    const tag = retry > 0 ? ` (retry ${retry})` : '';

    ws.on('open', () => 
    {
        console.log(`Connected${tag}`);
        const hwid = globalThis.getHardwareId();
        heartbeatInterval = setInterval(() => 
        {
            if (ws.readyState === WebSocket.OPEN) 
            {
                ws.ping();
            }
        }, 10 * 1000);
        ws.on('message', (message) => 
        {
            const msg = globalThis.parse(message);
            if (!msg) 
            {
                ws.close();
                return;
            }
            switch (msg.type) 
            {
                case 'auth_required':
                    ws.send(JSON.stringify({ type: 'auth', key, hwid }));
                    break;
                case 'auth_success':
                    console.log('Authenticated');
                    if (!STARTED) 
                    {
                        STARTED = true;
                        retry = 0;
                        globalThis.init();
                    }
                    break;
                case 'error':
                    console.log('Received error:', msg);
                    rejected = FATAL_ERRORS.includes(msg.message);
                    if (rejected) console.log('Fatal error detected');
                    ws.close();
                    break;
            }
        });
    });

    ws.on('close', () => 
    {
        console.log('Disconnected from server');
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        if (rejected || retry >= MAX_RETRIES) 
        {
            console.log(rejected ? 'Authentication failed. Not retrying.' : 'Max retries reached.');
            process.exit();
        } 
        else 
        {
            console.log(`Reconnecting in 2 seconds... (${retry + 1}/${MAX_RETRIES})`);
            setTimeout(() => connectClient(key, retry + 1), 2000);
        }
    });

    ws.on('error', (err) => 
    {
        console.log('Connection error:', err.message);
    });
}

function cleanup() 
{
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (currentSocket && currentSocket.readyState === WebSocket.OPEN) 
    {
        currentSocket.close();
    }
    process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

connectClient(config.key);
