//@ts-check
/*
  Copyright: (c) 2018-2020, ST-One Ltda.
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const net = require('net');

const ISOOnTCPParser = require('./parser.js');
const ISOOnTCPSerializer = require('./serializer.js');
const ISOOnTCPClient = require('./client.js');
const constants = require('./constants.json');

/**
 * Creates a TCP socket using 
 * {@linkcode https://nodejs.org/api/net.html#net_net_createconnection_port_host_connectlistener net.createConnection()} 
 * and passes it to a new instance of {@link ISOOnTCPClient}, calling 
 * {@link ISOOnTCPClient~connect} when the TCP socket emits the
 * connect event. The <code>handleStreamEvents</code> option is set on the created client
 * 
 * @param {object} opts options to the constructor
 * @param {number} [opts.port=102] the destination TCP port it should connect to
 * @param {string} [opts.host='localhost'] the destination host it should connect to
 * @param {number} [opts.tpduSize=1024] the tpdu size. Must be a power of 2
 * @param {number} [opts.srcTSAP=0] the source TSAP
 * @param {number} [opts.dstTSAP=0] the destination TSAP
 * @param {number} [opts.sourceRef] our reference. If not provided, an random one is generated
 * @param {boolean} [opts.forceClose=false] skip sending Disconnect Requests on disconnecting, and forcibly closes the connection instead
 * @param {function} [cb] an optional callback that will be added to the 'connect' event of the returned instance of {@link ISOOnTCPClient}
 * @returns {ISOOnTCPClient}
 */
function createConnection(opts = {}, cb) {
    
    let client;
    let socket = net.createConnection(opts.port || 102, opts.host || 'localhost', () => {
        client.connect(cb);
    });
    client = new ISOOnTCPClient(socket, opts);
    
    return client;
}

module.exports = {
    ISOOnTCPParser,
    ISOOnTCPSerializer,
    ISOOnTCPClient,
    constants,
    createConnection
};