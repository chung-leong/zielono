import HTTP from 'http';
import HTTPS from 'https';

const httpAgent = new HTTP.Agent({ keepAlive: true });
const httpsAgent = new HTTPS.Agent({ keepAlive: true });

function getAgent(url) {
	if (url.protocol == 'http:') {
		return httpAgent;
	} else {
		return httpsAgent;
	}
}

export {
  getAgent,
};
