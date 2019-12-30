


type Connection = {
    localId: string
    connection: RTCPeerConnection
    joinChannel: RTCDataChannel
    eventsChannel: RTCDataChannel
    type: 'LOCAL' | 'REMOTE'
    status: 'AWAITING_ANSWER' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'AWAITING_CONFIRMATION'
    answer?: any
}

type TxEvent = any


type Invitation = {
  type: 'Invitation',
  answerNodeId: string,
  offerNodeId: string,
  description: RTCSessionDescription,
  candidate: RTCIceCandidate,
}

type Answer = {
  type: 'Answer',
  answerNodeId: string,
  offerNodeId: string,
  description: RTCSessionDescription,
  candidate: RTCIceCandidate,
}


type InvitationResponsePayload = {
  type: 'InvitationResponse',
  requestId: string,
  answerNodeId: string,
  offerNodeId: string,
  description: RTCSessionDescription,
  candidate: RTCIceCandidate,
}

type InvitationRequestPayload = {
  type: 'InvitationRequest'
  requestId: string
  answerNodeId: string
  offerNodeId: string
}

type InvitationAnswerPayload = {
  type: 'InvitationAnswer'
  answerNodeId: string
  offerNodeId: string
  description: RTCSessionDescription
  candidate: RTCIceCandidate
}


type InvitationEvent = InvitationRequestPayload | InvitationResponsePayload | InvitationAnswerPayload



export class Node {
  id: string
  connections: { [remoteNodeId: string]: Connection }
  txs: Array<TxEvent>
  onTx: (e: TxEvent) => unknown

  constructor(onTx: any) {
    this.id = `NODE-${Math.random()}`
    this.connections = {}
    this.txs = []

    this.onTx = e => {
      this.txs.push(e)
      return onTx(this.txs)
    }
  }

  // Public

  collectNetworkInvitations(remoteNodeId: string) {
    const pendingInvitationsFromNetwork = Object.values(this.connections)
      .map(connection => this.forwardInvitationRequest(connection, remoteNodeId))

    const localConnectionInvitation = this.createLocalConnectionAndInvitation(remoteNodeId)

    return Promise.all([
      localConnectionInvitation,
      ...pendingInvitationsFromNetwork,
    ])
  }

  createAnswers(networkInvitations: Array<Invitation>): Promise<Array<Answer>> {
    const pendingAnswers = networkInvitations.map(payload => this.createRemoteConnectionAndAnswer(payload))

    return Promise.all(pendingAnswers)
  }

  acceptAnswers(answers: Array<Answer>) {
    answers.forEach(answer => {
      if (answer.offerNodeId === this.id) {
        const pendingConnection = this.connections[answer.answerNodeId]
        this.acceptAnswerForLocalConnection(pendingConnection, answer)
      } else {
        const pendingConnection = this.connections[answer.offerNodeId]
        this.forwardAnswer(pendingConnection, answer)
      }
    })
  }

  postTxEvent(event: TxEvent) {
    Object.values(this.connections).forEach(connection => {
      try {
        connection.eventsChannel.send(JSON.stringify(event))
      } catch(e) {
        console.log(e)
      }
    })
    this.onTx(event)
  }



  // Connections

  // Create local/remote connections with invitations/answers

  private joinChannelHandler(payload: InvitationEvent, channel: RTCDataChannel) {
    console.log("JOIN PAYLOAD", payload)

    if (payload.type === 'InvitationRequest') {
      this.respondToInvitationRequest(payload, channel)


    } else if (payload.type === 'InvitationAnswer') {
      this.acceptAnswerForLocalConnection(this.connections[payload.answerNodeId], payload)
    }
  }

  private createLocalConnectionAndInvitation(answerNodeId: string): Promise<Invitation> {
    const connection = new RTCPeerConnection()
    const joinChannel = connection.createDataChannel('join')
    const eventsChannel = connection.createDataChannel('events')

    this.connections[answerNodeId] = {
      localId: this.id,
      connection,
      joinChannel,
      eventsChannel,
      type: 'LOCAL',
      status: 'AWAITING_ANSWER'
    }


    joinChannel.addEventListener('message', evt => this.joinChannelHandler(JSON.parse(evt.data), joinChannel))
    eventsChannel.addEventListener('message', evt => this.onTx(JSON.parse(evt.data)))

    connection.onconnectionstatechange = () => {
      console.log("local connection state change:", connection.connectionState)
    }


    return new Promise(res => {
      connection.onicecandidate = e => {
        console.log("local candidate created")
        if (!connection.localDescription) throw new Error('oops')

        if (e.candidate) {
          res({
            answerNodeId,
            description: connection.localDescription,
            candidate: e.candidate,
            offerNodeId: this.id,
            type: 'Invitation'
          })
        }
      }

      console.log("creating invitation")
      connection.createOffer()
        .then(offer =>
          connection.setLocalDescription(offer)
        )
        .catch(console.log)
    })
  }

  private createRemoteConnectionAndAnswer(invitation: Invitation): Promise<Answer> {
    const connection = new RTCPeerConnection()

    const remoteConnection: Connection = this.connections[invitation.offerNodeId] = {
      localId: this.id,
      type: 'REMOTE',
      status: 'AWAITING_CONFIRMATION',
      connection,
      joinChannel: null as any,
      eventsChannel: null as any,
    }


    connection.ondatachannel = e => {
      console.log('remote ondatachannel')
      const channel = e.channel

      if (channel.label === 'join') {
        remoteConnection.joinChannel = channel
        channel.onmessage = evt => this.joinChannelHandler(evt.data, channel)
      } else if (channel.label === 'events') {
        remoteConnection.eventsChannel = channel
        channel.onmessage = evt => this.onTx(JSON.parse(evt.data))

      }
    }

    connection.onconnectionstatechange = () => {
      console.log("remote connection state change:", connection.connectionState)
    }


    connection.setRemoteDescription(invitation.description)
    connection.addIceCandidate(invitation.candidate).catch(console.log);

    const deferredAnswer: Promise<Answer> = new Promise(res => {
      connection.onicecandidate = e => {
        console.log("remote candidate created")
        if (e.candidate) {
          remoteConnection.status = 'ACCEPTED'
          const answer: Answer = {
            description: connection.localDescription as RTCSessionDescription,
            candidate: e.candidate,
            offerNodeId: invitation.offerNodeId,
            answerNodeId: this.id,
            type: 'Answer'
          }
          res(answer)
        }
      }
    })

    connection.createAnswer()
      .then(description => {
        connection.setLocalDescription(description)
      })
      .catch(console.log)

    return deferredAnswer
  }


  // request an invitation from a connection on behalf of the joining node
  private forwardInvitationRequest(connection: Connection, answerNodeId: string) {
    const requestId = 'join-package-' + Math.random()

    connection.joinChannel.send(JSON.stringify({
      requestId,
      answerNodeId,
      offerNodeId: connection.localId,
      type: 'InvitationRequest',
    }))

    return new Promise(resolve => {
      const evtHandler = (evt: MessageEvent) => {
        const payload = JSON.parse(evt.data)
        if (payload.type === 'InvitationResponse' && payload.requestId === requestId) {
          const invitation: Invitation = {
            type: 'Invitation',
            answerNodeId: payload.answerNodeId,
            offerNodeId: payload.offerNodeId,
            description: payload.description,
            candidate: payload.candidate,

          }
          resolve(invitation)
          connection.joinChannel.removeEventListener('message', evtHandler)
        }
      }

      connection.joinChannel.addEventListener('message', evtHandler)
    })
  }

  private async respondToInvitationRequest(payload: InvitationRequestPayload, channel: RTCDataChannel) {
    const invitation = await this.createLocalConnectionAndInvitation(payload.answerNodeId)
    channel.send(JSON.stringify({
      description: invitation.description,
      candidate: invitation.candidate,
      type: 'InvitationResponse',
      requestId: payload.requestId,
      offerNodeId: this.id,
      answerNodeId: payload.answerNodeId,
    }))
  }

  private async acceptAnswerForLocalConnection(connection: Connection, { description, candidate }: Answer | InvitationAnswerPayload) {
    console.log('receiving answer...', { description, candidate })

    if (connection.status !== 'AWAITING_ANSWER') return
    connection.status = 'PENDING'

    try {
      await connection.connection.setRemoteDescription(description)
      await connection.connection.addIceCandidate(candidate)
      connection.status = 'ACCEPTED'
      console.log('answer accepted')
    } catch (e) {
        connection.status = 'REJECTED'
        console.log(e)
    }
  }

  private forwardAnswer(connection: Connection, answer: Answer) {
    console.log('sending invitation answer...')
    connection.joinChannel.send(JSON.stringify({
      ...answer,
      type: 'InvitationAnswer',
    }))
  }
}


// For Nodes A, B, C
// A and B connect

// >>>>>>>>>>>>> offline: C gives B their id <<<<<<<<<<<<<<

// B creates an invitation collection using C's id (collectNetworkInvitations)
  // B creates its own invitation + local connection (createLocalConnectionAndInvitation)
  // B forwards the invitation request to A (forwardInvitationRequest)
  // A creates a local connection + responds with an invitation (respondToInvitationRequest)
  // B creates an invitation payload from A + its own invitation

// >>>>>>>>>>>>> offline: B gives C the invitation payload <<<<<<<<<<<<<<

// C creates a remote client for each invitation (createAnswers)
// C produces an answer payload for each client

// >>>>>>>>>>>>> offline: C gives B the answer payload <<<<<<<<<<<<<<

// B accepts the answer payload (acceptAnswers)
  // B accepts the C-B answer (acceptAnswerForLocalConnection)
  // B forwards the C-A answer to A (forwardAnswer)
  // A accepts the C-A anwer (acceptAnswerForLocalConnection)
