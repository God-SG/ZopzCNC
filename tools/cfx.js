const fetch = require('node-fetch');

module.exports = async (params, stream) => {
  // Tool description
  const description = "Fetches server details for a given CFX server ID, including IP, game type, and geo information.";

  // Display description if no params are provided
  if (params.length === 0) {
    stream.write(`${description}\r\n`);
    return;
  }

  try {
    const cfxResponse = await fetch(`https://zopzsniff.xyz/api/server/${params[0]}?key=1293FEC15E625CF2CFFA4D3CA9563`);
    const data = await cfxResponse.json();
    if (data.serverData && data.serverData.Data) {
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

      if (data.geoInfo) {
        stream.write(`\r======================== \n\r`);
        stream.write(`\rGeo Info\n`);
        stream.write(`\r======================== \n\r`);
        stream.write(`\rLocation: ${data.geoInfo.city}, ${data.geoInfo.region}, ${data.geoInfo.country}\n\r`);
        stream.write(`\rCoordinates: Lat ${data.geoInfo.lat}, Lon ${data.geoInfo.lon}\n\r`);
      } else {
        try {
          const geoResponse = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city,lat,lon`);
          const geoData = await geoResponse.json();
          if (geoData.status === 'success') {
            stream.write(`\r======================== \n\r`);
            stream.write(`\rGeo Info\n`);
            stream.write(`\r======================== \n\r`);
            stream.write(`\rLocation: ${geoData.city}, ${geoData.regionName}, ${geoData.country}\n\r`);
            stream.write(`\rCoordinates: Lat ${geoData.lat}, Lon ${geoData.lon}\n\r`);
          } else {
            stream.write(`Location: Geo information unavailable (${geoData.message || 'Unknown error'})\n`);
          }
        } catch (geoError) {
          stream.write(`Location: Geo information unavailable (Error: ${geoError.message})\n`);
        }
      }
    } else {
      stream.write('Failed to fetch CFX server details\n');
    }
  } catch (error) {
    stream.write(`Error fetching CFX data: ${error.message}\n`);
  }
};

// Export tool description for later use
module.exports.description = "Fetches details for a CFX server by ID.";