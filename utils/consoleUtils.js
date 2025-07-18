function replaceUsername(text, user) 
{
    const username = user?.username || 'unknown';
    return text.replace(/{username.user}/g, username);
}

function replaceCNCname(text, name) 
{
    return text.replace(/{cnc.name}/g, name);
}

function sanitizeAdminLines(text, user) 
{
    if (!user || typeof user.admin === 'undefined') return text;
    return user.admin ? text : text.split('\n').filter(line => !line.toLowerCase().includes('admin')).join('\n');
}

function sanitizeResellerLines(text, user) 
{
    if (!user || typeof user.reseller === 'undefined') return text;
    return user.reseller ? text : text.split('\n').filter(line => !line.toLowerCase().includes('reseller')).join('\n');
}

function stripAnsi(str) 
{
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function clearScreen(stream)
{
  stream.write('\x1B[2J\x1B[H');
}

function resizeTerminal(stream)
{
  stream.write('\x1B[8;24;80t');
}

function replaceTitle(prompt, config, activeSessions, apiHandler, _user) 
{
    const defaultSpinner = ['|', '/', '-', '\\'];
    const succubusSpinner = ['<   3', '<-  3', '< - 3', '<  -3'];
    const spinnerType = config.spinnertype === 'succubus' ? succubusSpinner : defaultSpinner;
    if (typeof config.spinnerIndex === 'undefined') 
    {
        config.spinnerIndex = 0;
    }
    const spinnerChar = spinnerType[config.spinnerIndex];
    config.spinnerIndex = (config.spinnerIndex + 1) % spinnerType.length;
    return prompt.replace(/{cnc_name}/g, config.cnc_name)
        .replace(/{online}/g, activeSessions.size)
        .replace(/{used_slots}/g, apiHandler.activeAttacks.size)
        .replace(/{max_slots}/g, config.max_concurrents)
        .replace(/{expiry}/g, _user.expiry)
        .replace(/{spinner}/g, spinnerChar);
}

function replaceplan(prompt, user) 
{
    return prompt.replace(/{user.username}/g, user.username)
        .replace(/{user.password}/g, user.password)
        .replace(/{user.role}/g, user.role)
        .replace(/{user.admin}/g, user.admin)
        .replace(/{user.reseller}/g, user.reseller)
        .replace(/{user.vip}/g, user.vip)
        .replace(/{user.expiry}/g, user.expiry)
        .replace(/{user.maxTime}/g, user.maxTime)
        .replace(/{user.concurrents}/g, user.concurrents)
        .replace(/{user.cooldown}/g, user.cooldown)
        .replace(/{user.api}/g, user.api)
        .replace(/{user.spambypass}/g, user.spambypass)
        .replace(/{user.blacklistbypass}/g, user.blacklistbypass)
        .replace(/{user.homeholder}/g, user.homeholder)
        .replace(/{user.botnet}/g, user.botnet)
        .replace(/{user.banned}/g, user.banned)
}

function replaceResellerstats(text, user) 
{
   return text.replace(/{username}/g, user.username)
          .replace(/{reseller.usersSold}/g, user.usersSold)
          .replace(/{reseller.earnings}/g, user.earnings)
          .replace(/{reseller.owed}/g, user.owed);
}

/*function redrawInline(stream, buffer, cursorPosition  = 0, promptLength = 0, lastDrawnLengthRef) 
{
    if (!stream || typeof stream.write !== 'function') 
    {
        console.warn("redrawInline was called with invalid stream:", stream);
        return;
    }
    const cursorCol = promptLength + cursorPosition + 1;
    stream.write(`\x1b[${promptLength + 1}G`);
    stream.write(buffer);
    const excess = lastDrawnLengthRef.value - buffer.length;
    if (excess > 0) 
    {
        stream.write(' '.repeat(excess));
        stream.write(`\x1b[${excess}D`);
    }
    stream.write(`\x1b[${cursorCol}G`);
    lastDrawnLengthRef.value = buffer.length;
}*/

function redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef)
{
    const cleanBuffer = buffer.replace(/\r|\n/g, ''); 
    const excess = lastDrawnLengthRef.value - cleanBuffer.length;
    let injected = '';
    injected += `\r\x1b[${promptLength + 1}G`;
    injected += cleanBuffer;
    if (excess > 0) 
    {
        injected += ' '.repeat(excess);
        injected += `\x1b[${excess}D`;
    }
    injected += `\x1b[${promptLength + cursorPosition + 1}G`;
    stream.write(injected);
    lastDrawnLengthRef.value = cleanBuffer.length;
}

globalThis.replaceplan = replaceplan;
globalThis.redrawInline = redrawInline;
globalThis.replaceTitle = replaceTitle;
globalThis.replaceCNCname = replaceCNCname;
globalThis.replaceUsername = replaceUsername;

globalThis.stripAnsi = stripAnsi;

globalThis.sanitizeAdminLines = sanitizeAdminLines;
globalThis.sanitizeResellerLines = sanitizeResellerLines;
globalThis.clearScreen = clearScreen;
globalThis.resizeTerminal = resizeTerminal;