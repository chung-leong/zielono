import Http from 'http';
import Https from 'https';

const httpAgent = new Http.Agent({ keepAlive: true });
const httpsAgent = new Https.Agent({ keepAlive: true });

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
