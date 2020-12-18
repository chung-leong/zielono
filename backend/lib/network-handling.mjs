import { networkInterfaces } from 'os';

function getIPv4Addresses() {
  const addresses = [];
  for (let [ name, interfaces ] of Object.entries(networkInterfaces())) {
    for (let { address, family, internal } of interfaces) {
      if (!internal && family === 'IPv4' && !addresses.includes(address)) {
        addresses.push(address);
      }
    }
  }
  return addresses;
}

function getIPv4Address() {
  const addresses = getIPv4Addresses();
  if (addresses.length > 0) {
    return addresses[0]
  }
  const { lo } = networkInterfaces();
  for (let { address, family } of lo) {
    if (family === 'IPv4') {
      return address;
    }
  }
  return '127.0.0.1';
}

function getMacAddresses() {
  const addresses = [];
  for (let [ name, interfaces ] of Object.entries(networkInterfaces())) {
    for (let { mac, internal } of interfaces) {
      if (!internal && !addresses.includes(mac)) {
        addresses.push(mac);
      }
    }
  }
  return addresses;
}

export {
  getIPv4Addresses,
  getIPv4Address,
  getMacAddresses,
};
