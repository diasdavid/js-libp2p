'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai
const sinon = require('sinon')

const pWaitFor = require('p-wait-for')
const pDefer = require('p-defer')
const mergeOptions = require('merge-options')
const multiaddr = require('multiaddr')

const { create } = require('../../src')
const { subsystemOptions, subsystemMulticodecs } = require('./utils')
const peerUtils = require('../utils/creators/peer')

const listenAddr = multiaddr('/ip4/127.0.0.1/tcp/0')
const remoteListenAddr = multiaddr('/ip4/127.0.0.1/tcp/0')

describe('Pubsub subsystem operates correctly', () => {
  let peerId, remotePeerId
  let libp2p, remoteLibp2p

  beforeEach(async () => {
    [peerId, remotePeerId] = await peerUtils.createPeerId({ number: 2 })
  })

  describe('pubsub started before connect', () => {
    beforeEach(async () => {
      libp2p = await create(mergeOptions(subsystemOptions, {
        peerId,
        addresses: {
          listen: [listenAddr]
        }
      }))

      remoteLibp2p = await create(mergeOptions(subsystemOptions, {
        peerId: remotePeerId,
        addresses: {
          listen: [remoteListenAddr]
        }
      }))

      await Promise.all([
        libp2p.start(),
        remoteLibp2p.start()
      ])

      libp2p.peerStore.addressBook.set(remotePeerId, remoteLibp2p.addresses.listen)
    })

    afterEach(() => Promise.all([
      libp2p && libp2p.stop(),
      remoteLibp2p && remoteLibp2p.stop()
    ]))

    afterEach(() => {
      sinon.restore()
    })

    it('should get notified of connected peers on dial', async () => {
      const connection = await libp2p.dialProtocol(remotePeerId, subsystemMulticodecs)

      expect(connection).to.exist()

      return Promise.all([
        pWaitFor(() => libp2p.pubsub._pubsub.peers.size === 1),
        pWaitFor(() => remoteLibp2p.pubsub._pubsub.peers.size === 1)
      ])
    })

    it('should receive pubsub messages', async () => {
      const defer = pDefer()
      const topic = 'test-topic'
      const data = 'hey!'
      const libp2pId = libp2p.peerId.toB58String()

      await libp2p.dialProtocol(remotePeerId, subsystemMulticodecs)

      let subscribedTopics = libp2p.pubsub.getTopics()
      expect(subscribedTopics).to.not.include(topic)

      libp2p.pubsub.subscribe(topic, (msg) => {
        expect(msg.data.toString()).to.equal(data)
        defer.resolve()
      })

      subscribedTopics = libp2p.pubsub.getTopics()
      expect(subscribedTopics).to.include(topic)

      // wait for remoteLibp2p to know about libp2p subscription
      await pWaitFor(() => {
        const subscribedPeers = remoteLibp2p.pubsub.getSubscribers(topic)
        return subscribedPeers.includes(libp2pId)
      })
      remoteLibp2p.pubsub.publish(topic, data)

      await defer.promise
    })
  })

  describe('pubsub started after connect', () => {
    beforeEach(async () => {
      libp2p = await create(mergeOptions(subsystemOptions, {
        peerId,
        addresses: {
          listen: [listenAddr]
        }
      }))

      remoteLibp2p = await create(mergeOptions(subsystemOptions, {
        peerId: remotePeerId,
        addresses: {
          listen: [remoteListenAddr]
        },
        config: {
          pubsub: {
            enabled: false
          }
        }
      }))

      await libp2p.start()
      await remoteLibp2p.start()

      libp2p.peerStore.addressBook.set(remotePeerId, remoteLibp2p.addresses.listen)
    })

    afterEach(() => Promise.all([
      libp2p && libp2p.stop(),
      remoteLibp2p && remoteLibp2p.stop()
    ]))

    afterEach(() => {
      sinon.restore()
    })

    it('should get notified of connected peers after starting', async () => {
      const connection = await libp2p.dial(remotePeerId)

      expect(connection).to.exist()
      expect(libp2p.pubsub._pubsub.peers.size).to.be.eql(0)
      expect(remoteLibp2p.pubsub._pubsub.peers.size).to.be.eql(0)

      remoteLibp2p.pubsub.start()

      return Promise.all([
        pWaitFor(() => libp2p.pubsub._pubsub.peers.size === 1),
        pWaitFor(() => remoteLibp2p.pubsub._pubsub.peers.size === 1)
      ])
    })

    it('should receive pubsub messages', async function () {
      this.timeout(10e3)
      const defer = pDefer()
      const libp2pId = libp2p.peerId.toB58String()
      const topic = 'test-topic'
      const data = 'hey!'

      await libp2p.dial(remotePeerId)

      remoteLibp2p.pubsub.start()

      await Promise.all([
        pWaitFor(() => libp2p.pubsub._pubsub.peers.size === 1),
        pWaitFor(() => remoteLibp2p.pubsub._pubsub.peers.size === 1)
      ])

      let subscribedTopics = libp2p.pubsub.getTopics()
      expect(subscribedTopics).to.not.include(topic)

      libp2p.pubsub.subscribe(topic, (msg) => {
        expect(msg.data.toString()).to.equal(data)
        defer.resolve()
      })

      subscribedTopics = libp2p.pubsub.getTopics()
      expect(subscribedTopics).to.include(topic)

      // wait for remoteLibp2p to know about libp2p subscription
      await pWaitFor(() => {
        const subscribedPeers = remoteLibp2p.pubsub.getSubscribers(topic)
        return subscribedPeers.includes(libp2pId)
      })

      remoteLibp2p.pubsub.publish(topic, data)

      await defer.promise
    })
  })
})
