const fetch = require('node-fetch');

module.exports = async (params, stream) => {
  // Tool description
  const description = "Performs a port scan on a specified IP/hostname to check for open ports and services.";

  // Display description if no params are provided
  if (params.length === 0) {
    stream.write(`${description}\r\n`);
    return;
  }

  try {
    const ip = params[0];
    const portscanResponse = await fetch(`https://webresolver.nl/api.php?key=KC3B9-E9T5K-3TNS9-XDGC9&json&action=portscan&string=${ip}`);
    const portscanData = await portscanResponse.json();

    if (portscanData.ports) {
      stream.write(`\r======================== \n\r`);
      stream.write(`\rPort Scan Results\n`);
      stream.write(`\r======================== \n\r`);
      stream.write(`\rDomain/IP: ${portscanData.domain}\n\r`);
      stream.write(`\r======================== \n\r`);
      portscanData.ports.forEach((portInfo) => {
        const portStatus = portInfo.open === "true" ? "Open" : "Closed";
        stream.write(`Port ${portInfo.port} (${portInfo.service}): ${portStatus}\n\r`);
      });
    } else {
      stream.write('Failed to fetch port scan results\n');
    }
  } catch (error) {
    stream.write(`Error performing port scan: ${error.message}\n`);
  }
};

// Export tool description for later use
module.exports.description = "Performs a port scan on a specified IP/hostname.";