const axios = require('axios');

const colors = 
{
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

class CheckHost
{
    constructor() {}

    async startCheck(type, target) 
    {
        const res = await axios.post(`https://check-host.net/check-${type}`, null, 
        {
            params: { host: target }
        });
        return res.data.request_id;
    }

    async getResult(requestId) 
    {
        for (let i = 0; i < 10; i++) 
        {
            await new Promise(resolve => setTimeout(resolve, 2000)); 
            const res = await axios.get(`https://check-host.net/check-result/${requestId}`);
            if (res.data && Object.values(res.data).some(r => r !== null)) 
            {
                return res.data;
            }
        }
        throw new Error("Timeout waiting for result");
    }

    async pingHost(target) 
    {
        const requestId = await this.startCheck('ping', target);
        return await this.getResult(requestId);
    }

    async tcpPingHost(target, port = 80) 
    {
        const requestId = await this.startCheck('tcp', `${target}:${port}`);
        return await this.getResult(requestId);
    }

    logCheckHostResult(title, result, type = 'ping') 
    {
        console.log(`\n${colors.bold}[${title.toUpperCase()} RESULT]${colors.reset}`);
        for (const [node, data] of Object.entries(result)) 
        {
            process.stdout.write(`${colors.cyan}- ${node}:${colors.reset} `);
            if (!data) 
            {
                console.log(`${colors.red}❌ No response${colors.reset}`);
                continue;
            }

            if (type === 'ping')
            {
                const pings = data[0]; 
                const times = pings.filter(item => item && item[1] !== null).map(item => item[1]);
                if (times.length === 0) 
                {
                    console.log(`${colors.red}❌ Timeout${colors.reset}`);
                } 
                else 
                {
                    const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);
                    console.log(`${colors.green}📶 Avg: ${avg} ms${colors.reset} ${colors.yellow}(${times.map(t => `${t}ms`).join(', ')})${colors.reset}`);
                }
            } 
            else if (type === 'tcp') 
            {
                const entry = data[0];
                if (entry && entry.time !== undefined) 
                {
                    console.log(`${colors.green}🌐 ${entry.address}${colors.reset} ⏱️ ${colors.yellow}${Math.round(entry.time * 1000)} ms${colors.reset}`);
                } 
                else 
                {
                    console.log(`${colors.red}❌ No TCP response${colors.reset}`);
                }
            }
        }
    }
}

globalThis.CheckHost = CheckHost;