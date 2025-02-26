const URL = require('url');
const Socket = require('net').Socket;
const axios = require('axios');

const getTld = (hostname) => {
  if (!hostname) {
    return '';
  }

  return hostname.substring(hostname.lastIndexOf('.') + 1);
};

const checkConnection = (host, port) =>
  new Promise((resolve) => {
    const socket = new Socket();

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });

    // Try to connect to the host and port
    socket.connect(port, host);
  });

/**
 * Function that configures axios with timing interceptors
 * Important to note here that the timings are not completely accurate.
 * @see https://github.com/axios/axios/issues/695
 * @returns {axios.AxiosInstance}
 */
function makeAxiosInstance() {
  /** @type {axios.AxiosInstance} */
  const instance = axios.create();

  instance.interceptors.request.use(async (config) => {
    const url = URL.parse(config.url);

    // Resolve all *.localhost to localhost and check if it should use IPv6 or IPv4
    // RFC: 6761 section 6.3 (https://tools.ietf.org/html/rfc6761#section-6.3)
    // @see https://github.com/usebruno/bruno/issues/124
    if (getTld(url.hostname) === 'localhost') {
      config.headers.Host = url.hostname; // Put original hostname in Host

      const portNumber = Number(url.port) || (url.protocol.includes('https') ? 443 : 80);
      const useIpv6 = await checkConnection('::1', portNumber);
      url.hostname = useIpv6 ? '::1' : '127.0.0.1';
      delete url.host; // Clear hostname cache
      config.url = URL.format(url);
    }

    config.headers['request-start-time'] = Date.now();
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      const end = Date.now();
      const start = response.config.headers['request-start-time'];
      response.headers['request-duration'] = end - start;
      return response;
    },
    (error) => {
      if (error.response) {
        const end = Date.now();
        const start = error.config.headers['request-start-time'];
        error.response.headers['request-duration'] = end - start;
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

module.exports = {
  makeAxiosInstance
};
