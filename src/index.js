/** We want to expose server and client in one package.
 * To avoid the whole server-side be packaged for client we use
 * a hacky 'eval'.
 * As we want createServer to be symmetric to createClient we
 * end up passing some options through from here and to createServer
 * inside of monster-server.js.
 */
const createServer = require('./express-server')
// const createClient = require('./src/monsterr-client')

module.exports = createServer
// module.exports.createClient = createClient

module.exports.Network = require('./network')
