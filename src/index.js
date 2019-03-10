/*
   Copyright 2018 Smart-Tech Controle e Automação

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
/*jshint esversion: 6, node: true*/

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
 * @param {number} opts.port the destination TCP port it should connect to
 * @param {string} [opts.host='localhost'] the destination host it should connect to
 * @param {number} [opts.tpduSize=1024] the tpdu size. Must be a power of 2
 * @param {number} [opts.srcTSAP=0] the source TSAP
 * @param {number} [opts.dstTSAP=0] the destination TSAP
 * @param {number} [opts.sourceRef] our reference. If not provided, an random one is generated
 * @param {function} [cb] an optional callback that will be added to the 'connect' event of the returned instance of {@link ISOOnTCPClient}
 * @returns {ISOOnTCPClient}
 */
function createConnection(opts, cb) {
    opts = opts || {};
    opts.handleStreamEvents = true;

    let client;
    let socket = net.createConnection(opts.port, opts.host || 'localhost', () => {
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