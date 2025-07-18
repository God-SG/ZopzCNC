const dns = require('dns').promises;
const net = require('net');

async function resolveIP(hostname) 
{
    return await dns.lookup(hostname);
}

async function getTargetDetails(input) {
    let host = input;
    if (host.startsWith('http://') || host.startsWith('https://')) {
        host = new URL(host).hostname;
    }

    const ip = net.isIP(host) ? host : (await resolveIP(host))?.address;

    if (!ip) {
        return { asn: 'Unknown', org: 'Unknown', country_code: 'Unknown' };
    }

    const response = await fetch(`https://zopzsniff.xyz/geoip/${ip}`);
    const data = await response.json();

    if (response.ok) {
        return {
            asn: data.asn?.asn ? `AS${data.asn.asn}` : 'Unknown',
            org: data.asn?.org || 'Unknown',
            country_code: data.location?.country_code || 'Unknown'
        };
    }

    return { asn: 'Unknown', org: 'Unknown', country_code: 'Unknown' };
}

globalThis.getTargetDetails = getTargetDetails;