const fs = require('fs');

eval(fs.readFileSync('./handlers/MongoDB.js', 'utf8'));
eval(fs.readFileSync('./handlers/AttackHandler.js', 'utf8'));

eval(fs.readFileSync('./server/sshServer.js', 'utf8'));
eval(fs.readFileSync('./server/expressServer.js', 'utf8'));

const config = JSON.parse(fs.readFileSync('./configs/main.json'));

const mongo = new globalThis.MongoDB(config.mongo_url, config.mongo_db_name);
const attackHandler = new globalThis.AttackHandler();

async function init() 
{
  try 
  {
    console.log(config.banner_message)
    console.clear();
    attackHandler.loadmethods();
    await mongo.connectToDatabase();
    if (config.ssh.enabled) 
    {
      await globalThis.startSSHServer(config, mongo, attackHandler);
    }
    if (config.api.enabled) 
    {
      await globalThis.StartExpressServer(config, mongo, attackHandler);
    }
  } 
  catch (err) 
  {
    console.error('Connection failed:', err);
    return;
  }

  setInterval(async () => 
  {
    try 
    {
      await mongo.reconnectToDatabase();
    } 
    catch (err) 
    {
      console.error('[-] Reconnection failed:', err);
    }
  }, 12 * 60 * 60 * 1000);
}

globalThis.init = init;