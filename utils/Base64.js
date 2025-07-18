function base64ToString(base64) 
{
    return Buffer.from(base64, 'base64').toString('utf8');
}

globalThis.base64ToString = base64ToString;