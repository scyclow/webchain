const NODE_ID = `NODE-${Math.random()}`


export class Node {
  constructor(onNetworkEvent) {
    this.id = NODE_ID
    this.connections = {}
    this.txs = []

    this.onNetworkEvent = e => {
      this.txs.push(e)
      return onNetworkEvent(e)
    }
  }


  emitEvent(event) {
    Object.values(this.connections).map(connection => {
      try {
        connection.emitEvent(event)
      } catch(e) {console.log(e)}
    })
  }

  async collectNetworkInvitations(remoteNodeId) {
    const pendingInvitations = Object.values(this.connections)
      .map(connection => connection.requestInvitation(remoteNodeId))


    return Promise.all([
      ...pendingInvitations,
      this.createInvitationAndLocalConnection(remoteNodeId)
    ])
  }

  acceptAnswers(answers) {
    answers.forEach(answer => {
      if (answer.offerNodeId === this.id) {
        const pendingConnection = this.connections[answer.answerNodeId]
        pendingConnection.acceptAnswer(answer)
      } else {
        this.connections[answer.offerNodeId].sendAnswer(answer)
      }
    })
  }

  async createAnswers(networkInvitations) {
    const pendingInvitations = networkInvitations.map(payload => new Promise(res => {
      this.connections[payload.offerNodeId] = new RemoteConnection(
        this.id,
        payload,
        this.onNetworkEvent,
        this.joinChannelHandler.bind(this),
        (description, candidate) => res({
          description,
          candidate,
          offerNodeId: payload.offerNodeId,
          answerNodeId: this.id,
          type: 'Answer'
        })
      )
    }))

    return Promise.all(pendingInvitations)
  }

  // private
  createInvitationAndLocalConnection(answerNodeId) {
    return new Promise(res => {
      this.connections[answerNodeId] = new LocalConnection(
        this.id,
        this.onNetworkEvent,
        this.joinChannelHandler.bind(this), // TODO: do i need to bind this here?
        (description, candidate) => res({
          description,
          candidate,
          answerNodeId,
          offerNodeId: this.id,
          type: 'Invitation'
        })
      )
    })
  }

  async joinChannelHandler(data, channel) {
    const payload = JSON.parse(data)
    console.log("JOIN PAYLOAD", payload)
    if (payload.type === 'InvitationRequest') {
      const invitation = await this.createInvitationAndLocalConnection(payload.answerNodeId)
      channel.send(JSON.stringify({
        description: invitation.description,
        candidate: invitation.candidate,
        type: 'InvitationResponse',
        requestId: payload.requestId,
        offerNodeId: this.id,
        answerNodeId: payload.answerNodeId,
      }))


    } else if (payload.type === 'InvitationAnswer') {
      console.log('receiving answer...', payload)
      const pendingConnection = this.connections[payload.answerNodeId]
      pendingConnection.acceptAnswer(payload)
    }
  }
}

export class BaseConnection {
  sendInvitationRequest(answerNodeId) {
    const requestId = 'join-package-' + Math.random()

    this.joinChannel.send(JSON.stringify({
      requestId,
      answerNodeId,
      offerNodeId: this.localId,
      type: 'InvitationRequest',
    }))

    return requestId

  }

  async requestInvitation(nodeId) {
    const requestId = this.sendInvitationRequest(nodeId)

    return new Promise(resolve => {
      const evtHandler = evt => {
        const payload = JSON.parse(evt.data)
        if (payload.type === 'InvitationResponse' && payload.requestId === requestId) {
          resolve(payload)
          this.joinChannel.removeEventListener('message', evtHandler)
        }
      }

      this.joinChannel.addEventListener('message', evtHandler)
    })
  }

  sendAnswer(answer) {
    console.log('sending invitation answer...')
    this.joinChannel.send(JSON.stringify({
      ...answer,
      type: 'InvitationAnswer',
    }))
  }

  emitEvent(event) {
      this.eventsChannel.send(JSON.stringify(event))
  }
}

class LocalConnection extends BaseConnection {
  constructor(nodeId, onNetworkEvent, joinChannelHandler, onIceCandidate) {
    super()
    const connection = new RTCPeerConnection()
    const joinChannel = connection.createDataChannel('join')
    const eventsChannel = connection.createDataChannel('events')

    this.localId = nodeId
    this.connection = connection
    this.joinChannel = joinChannel
    this.eventsChannel = eventsChannel
    this.type = 'LOCAL'
    this.status = 'AWAITING_ANSWER'
    this.joinInfo = {}
    this.answer = {}

    joinChannel.addEventListener('message', evt => joinChannelHandler(evt.data, joinChannel))
    eventsChannel.addEventListener('message', evt => onNetworkEvent(evt.data))

    connection.onconnectionstatechange = () => {
      console.log("local connection state change:", connection.connectionState)
    }

    connection.onicecandidate = e => {
      console.log("local candidate created")
      if (e.candidate) {
        this.joinInfo.candidate = e.candidate
        onIceCandidate(this.joinInfo.description, this.joinInfo.candidate)
      }
    }

    console.log("creating invitation")
    connection.createOffer()
      .then(offer => {
        connection.setLocalDescription(offer)
        this.joinInfo.description = connection.localDescription
      })
      .catch(console.log)
  }

  getJoinInfo() {
    if (this.status !== 'AWAITING_ANSWER') return
    else return this.joinInfo
  }

  async acceptAnswer({ description, candidate }) {
    if (this.status !== 'AWAITING_ANSWER') return
    this.status = 'PENDING'

    this.answer.description = description
    this.answer.candidate = candidate


    try {
      await this.connection.setRemoteDescription(description)
      await this.connection.addIceCandidate(candidate)
      this.status = 'ACCEPTED'
      console.log('answer accepted')
    } catch (e) {
        this.status = 'REJECTED'
        console.log(e)
    }
  }
}

class RemoteConnection extends BaseConnection {
  constructor(nodeId, invitation, onNetworkEvent, joinChannelHandler, onIceCandidate) {
    super()
    const connection = new RTCPeerConnection()

    this.localId = nodeId
    this.connection = connection
    this.joinChannel = null
    this.eventsChannel = null
    this.type = 'REMOTE'
    this.status = 'AWAITING_CONFIRMATION'
    this.joinInfo = invitation
    this.answer = {}


    connection.onconnectionstatechange = () => {
      console.log("remote connection state change:", connection.connectionState)
    }

    connection.onicecandidate = e => {
      console.log("remote candidate created")
      if (e.candidate) {
        this.status = 'ACCEPTED'
        this.answer.candidate = e.candidate
        onIceCandidate(this.answer.description, this.answer.candidate)
      }
    }

    connection.ondatachannel = e => {
      console.log('remote ondatachannel')
      const channel = e.channel

      if (channel.label === 'join') {
        this.joinChannel = channel
        channel.onmessage = evt => joinChannelHandler(evt.data, channel)
      } else if (channel.label === 'events') {
        this.eventsChannel = channel
        channel.onmessage = evt => onNetworkEvent(evt.data)

      }
    }

    const { description, candidate } = invitation

    connection.setRemoteDescription(description)
    connection.addIceCandidate(candidate).catch(console.log);

    connection.createAnswer()
      .then(description => {
        this.answer.description = description
        connection.setLocalDescription(description)
      })
  }
}



// For Nodes A, B, C
// A and B connect

// >>>>>>>>>>>>> offline: C gives B their id <<<<<<<<<<<<<<

// B creates an invitation using C's id
  // B creates its own invitation + local connection
  // B forwards the invitation request to A
  // A creates a local connection + responds with an invitation
  // B creates an invitation payload from A + its own invitation

// >>>>>>>>>>>>> offline: B gives C the invitation payload <<<<<<<<<<<<<<

// C creates a remote client for each invitation
// C produces an answer payload for each client

// >>>>>>>>>>>>> offline: C gives B the answer payload <<<<<<<<<<<<<<

// B accepts the answer payload
  // B accepts the C-B answer
  // B forwards the C-A answer to A
  // A accepts the C-A anwer
