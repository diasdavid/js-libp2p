'use strict'

const duplexPair = require('it-pair/duplex')
const abortable = require('abortable-iterator')
const AbortController = require('abort-controller')

/**
 * Returns both sides of a mocked MultiaddrConnection
 * @param {object} options
 * @param {Multiaddr[]} options.addrs Should contain two addresses for the local and remote peer
 * @param {PeerId} options.remotePeer The peer that is being "dialed"
 * @returns {{inbound:MultiaddrConnection, outbound:MultiaddrConnection}}
 */
module.exports = function mockMultiaddrConn ({ addrs, remotePeer }) {
  const controller = new AbortController()

  const [inbound, outbound] = duplexPair()
  outbound.localAddr = addrs[0]
  outbound.remoteAddr = addrs[1].encapsulate(`/p2p/${remotePeer.toB58String()}`)
  outbound.timeline = {
    open: Date.now()
  }
  outbound.close = () => {
    outbound.timeline.close = Date.now()
    controller.abort()
  }

  inbound.localAddr = addrs[1]
  inbound.remoteAddr = addrs[0]
  inbound.timeline = {
    open: Date.now()
  }
  inbound.close = () => {
    inbound.timeline.close = Date.now()
    controller.abort()
  }

  // Make the sources abortable so we can close them easily
  inbound.source = abortable(inbound.source, controller.signal)
  outbound.source = abortable(outbound.source, controller.signal)

  return { inbound, outbound }
}
