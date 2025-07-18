const path = require('path');
const fs = require('fs');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/consoleUtils.js'), 'utf8'));

async function isUserExpired(config, mongo, _user) 
{
    const user = await mongo.findDocumentByKey('username', _user.username, config.mongo_db_collection);
    if (!user || !user.expiry) return true; 
    if (user.expiry == 'Lifetime') return false;
    const [month, day, year] = user.expiry.split('/').map(Number);
    const expiryDate = new Date(year, month - 1, day);
    const now = new Date();
    return now > expiryDate;
}

function getExpiryDays(expiry) 
{
    if (expiry === 'Lifetime') return 99999;
    const parts = expiry.split('/').map(part => part.trim());
    if (parts.length !== 3) return NaN;
    let [month, day, year] = parts.map(Number);
    const expiryDate = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(expiryDate.getTime())) return NaN;
    const currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0); 
    const diffTime = expiryDate.getTime() - currentDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return parseFloat(diffDays.toFixed(2));
}

function getTime(time) 
{
    let expiry = "";
    if (time.toLowerCase() !== "lifetime") 
    {
        const now = new Date();
        now.setDate(now.getDate() + parseInt(time));
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const year = now.getFullYear();
        expiry = `${month}/${day}/${year}`;
    } 
    else
    {
        expiry = "Lifetime";
    }
    return expiry;
}

function disconnectUserByUsername(activeSessions, targetUsername)
{
    const sessionsToKick = [...activeSessions.entries()].filter(([_, session]) => 
    {
        return session.user.username.toLowerCase() === targetUsername.toLowerCase();
    });
    for (const [sessionId, session] of sessionsToKick) 
    {
        try
        {
            session.client.end();
        } 
        catch (e) 
        {
            console.error(`[!] Error disconnecting ${targetUsername}:`, e.message);
        }
        if (session?.intervals) 
        {
            for (const interval of session.intervals) 
            {
                clearInterval(interval);
            }
        }
        activeSessions.delete(sessionId);
        console.log(`Disconnected user: ${targetUsername} (Session: ${sessionId})`);
    }
    return sessionsToKick.length > 0;
}
 
function broadcastMessage(senderUsername, activeSessions, message) 
{
    let count = 0;
    for (const [sessionId, session] of activeSessions.entries()) 
    {
        const user = session?.user;
        const stream = session?.stream;
        if (!user || !stream) continue;
        if (user.username.toLowerCase() === senderUsername.toLowerCase()) continue;
        try
        {
            globalThis.clearScreen(stream);
            stream.write(`\r${message}\n`);
            stream.write(`\nPress \x1b[32mEnter help\x1b[0m to return to the default menu...\n`);
            count++;
        } 
        catch (e) 
        {
            console.error(`[!] Error broadcasting to session ${sessionId}:`, e.message);
        }
    }
    console.log(`Broadcasted message to ${count} user(s): "${message}"`);
    return count;
}

globalThis.isUserExpired = isUserExpired;
globalThis.getExpiryDays = getExpiryDays;
globalThis.disconnectUserByUsername = disconnectUserByUsername;
globalThis.broadcastMessage = broadcastMessage;
globalThis.getTime = getTime;