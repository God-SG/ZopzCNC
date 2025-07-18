const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getHardwareId() {
  try {
    let productUUID = '';
    try {
      productUUID = execSync('cat /sys/class/dmi/id/product_uuid', { encoding: 'utf8' }).trim();
    } catch {}
    
    return crypto.createHash('sha256').update(productUUID).digest('hex');
  } catch (err) {
    console.error('HWID generation failed:', err);
    return null;
  }
}

globalThis.getHardwareId = getHardwareId;