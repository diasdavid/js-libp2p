'use strict'

const Transport = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const { NOISE: Crypto } = require('libp2p-noise')

module.exports = {
  modules: {
    transport: [Transport],
    streamMuxer: [Muxer],
    connEncryption: [Crypto]
  },
  config: {
    relay: {
      enabled: true,
      hop: {
        enabled: false
      }
    }
  }
}
