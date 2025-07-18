const fetch = require('node-fetch');

module.exports = async (params, stream) => {
  // Tool description
  const description = "Fetches details about an IP address including location, ISP, etc.";
  
  // Display description if no params are provided
  if (params.length === 0) {
    stream.write(`${description}\r\n`);
    return;
  }

  // IP address must be provided as a parameter
  const ipAddress = params[0];
  await fetch(`http://ip-api.com/json/${ipAddress}`)
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        stream.write(`\r\nHost Info:\r\n`);
        stream.write(`IP Address: ${ipAddress}\r\n`);
        stream.write(`Country: ${data.country}\r\n`);
        stream.write(`Region: ${data.regionName} (${data.region})\r\n`);
        stream.write(`City: ${data.city}\r\n`);
        stream.write(`ISP: ${data.isp}\r\n`);
        stream.write(`Coordinates: Lat ${data.lat}, Lon ${data.lon}\r\n`);
      } else {
        stream.write('Failed to fetch host details\r\n');
      }
    })
    .catch(_ => {
      stream.write('Error fetching host data\r\n');
    });
};

// Export tool description for later use
module.exports.description = "Fetches host info for a given IP address.";
