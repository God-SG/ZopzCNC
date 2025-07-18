const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

class Firewallmanger
{
    constructor() 
    { 
      this.isReady = this.checkSystem();
    }
    
    checkSystem() 
    {
        const tools = ['iptables', 'ip6tables'];
        let allPresent = true;
        for (const tool of tools) 
        {
            try
            {
                execSync(`command -v ${tool}`, { stdio: 'ignore' });
            }
            catch
            {
                console.error(`[!] Missing dependency: ${tool} not found`);
                allPresent = false;
            }
        }
        return allPresent;
    }
    
    async update(tof)
    {
        if (!this.isReady) 
        {
            console.error(`[!] System is not ready. Missing iptables or ip6tables.`);
            return;
        }
        const { api } = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/main.json')));
        console.log(`Fetching Cloudflare IP lists...`);
        const [ipv4List, ipv6List] = await Promise.all(
        [
            this.fetchList('https://www.cloudflare.com/ips-v4'),
            this.fetchList('https://www.cloudflare.com/ips-v6')
        ]);
        const subnets = 
        [
            ...ipv4List.map(ip => ({ ip, isV6: false })),
            ...ipv6List.map(ip => ({ ip, isV6: true }))
        ];
        if (tof) 
        {
            console.log(`Blocking all traffic to port ${api.port} by default...`);
            this.addDropRule(api.port, false);
            this.addDropRule(api.port, true);
        } 
        else
        {
            console.log(`Removing default block on port ${api.port}...`);
            this.removeDropRule(api.port, false);
            this.removeDropRule(api.port, true);
        }
        
        for (const { ip, isV6 } of subnets) 
        {
            if (!tof) 
            {
                console.log(`Removing ${isV6 ? 'IPv6' : 'IPv4'} rule for ${ip}`);
                this.removeRule(ip, api.port, isV6);
            } 
            else
            {
                console.log(`Adding ${isV6 ? 'IPv6' : 'IPv4'} rule for ${ip}`);
                this.addRule(ip, api.port, isV6);
            }
        }
        console.log(`[?] Firewall rules update complete.`);
    }
    
    fetchList(url)
    {
        return new Promise((resolve, reject) => 
        {
            https.get(url, res => 
            {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data.trim().split('\n')));
            }).on('error', reject);
        });
    }
    
    runCommand(cmd)
    {
        try
        {
            execSync(cmd, { stdio: 'inherit' });
        }
        catch (err) 
        {
            console.error(`[!] Failed: ${cmd}\n${err.message}`);
        }
    }
    
    addRule(subnet, port, isV6) 
    {
        const tool = isV6 ? 'ip6tables' : 'iptables';
        const cmd = `${tool} -I INPUT -p tcp --dport ${port} -s ${subnet} -j ACCEPT`;
        this.runCommand(cmd);
    }

    removeRule(subnet, port, isV6) 
    {
        const tool = isV6 ? 'ip6tables' : 'iptables';
        const cmd = `${tool} -D INPUT -p tcp --dport ${port} -s ${subnet} -j ACCEPT`;
        this.runCommand(cmd);
    }

    addDropRule(port, isV6) 
    {
        const tool = isV6 ? 'ip6tables' : 'iptables';
        const cmd = `${tool} -A INPUT -p tcp --dport ${port} -j DROP`;
        this.runCommand(cmd);
    }

    removeDropRule(port, isV6) 
    {
        const tool = isV6 ? 'ip6tables' : 'iptables';
        const cmd = `${tool} -D INPUT -p tcp --dport ${port} -j DROP`;
        this.runCommand(cmd);
    }
};

globalThis.Firewallmanger = Firewallmanger;