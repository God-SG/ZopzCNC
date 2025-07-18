
function parse(raw) 
{
    try 
    {
        return JSON.parse(raw);
    } 
    catch (e) 
    {
        return null;
    }
}

globalThis.parse = parse;