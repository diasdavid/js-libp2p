/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const getPeerInfo = require('../src/get-peer-info')

describe('getPeerInfo', () => {
  it('should callback with error for invalid string multiaddr', (done) => {
    getPeerInfo(null)('INVALID MULTIADDR', (err) => {
      expect(err).to.exist()
      expect(err.code).to.eql('ERR_INVALID_MULTIADDR')
      done()
    })
  })

  it('should callback with error for invalid non-peer multiaddr', (done) => {
    getPeerInfo(null)('/ip4/8.8.8.8/tcp/1080', (err) => {
      expect(err).to.exist()
      expect(err.code).to.equal('ERR_INVALID_MULTIADDR')
      done()
    })
  })

  it('should callback with error for invalid non-peer multiaddr', (done) => {
    getPeerInfo(null)(undefined, (err) => {
      expect(err).to.exist()
      expect(err.code).to.eql('ERR_INVALID_PEER_TYPE')
      done()
    })
  })
})
