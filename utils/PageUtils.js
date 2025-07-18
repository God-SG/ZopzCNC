const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (typeof __dirname === 'undefined')
{
    global.__dirname = path.resolve();
}

let lastHashes = {};
let currentPages = {};
let initialized = false;

function getHash(content) 
{
    return crypto.createHash('sha256').update(content).digest('hex');
}

function loadPages(config) 
{
    const pagesPath = path.join(__dirname, `./pages`);
    if (!fs.existsSync(pagesPath)) 
    {
        throw new Error(`[-] Pages directory does not exist: ${pagesPath}`);
    }
    const reloadPages = () => 
    {
        const files = fs.readdirSync(pagesPath);
        const updated = {};
        const newHashes = {};
        let changed = false;
        for (const file of files) 
        {
            if (!file.endsWith('.tfx')) continue;
            const pageName = path.basename(file, '.tfx');
            const filePath = path.join(pagesPath, file);
            try
            {
                const content = fs.readFileSync(filePath, 'utf8');
                const hash = getHash(content);
                newHashes[pageName] = hash;
                if (lastHashes[pageName] !== hash) 
                {
                    changed = true;
                }
                updated[pageName] = content;
            } 
            catch (err) 
            {
                console.error(`[-] Failed to load page ${filePath}:`, err.message);
            }
        }
        if (changed || Object.keys(updated).length !== Object.keys(currentPages).length) 
        {
            lastHashes = newHashes;
            currentPages = updated;
            console.log('Pages reloaded.');
        }
    };
    if (!initialized) 
    {
        initialized = true;
        fs.watch(pagesPath, { persistent: false }, (event, filename) => 
        {
            if (filename && filename.endsWith('.tfx')) 
            {
            
                clearTimeout(loadPages._timeout);
                loadPages._timeout = setTimeout(reloadPages, 250);
            }
        });
    }
    reloadPages();
    return currentPages;
}

globalThis.loadPages = loadPages;