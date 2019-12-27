Building a blockchain in the browser with WebRTC



My Tight 15:
  - 2 min
    - Blockchains are terrbile. a BC can be considered the world's slowest, most expensive, least efficient computer. So far, the main practical applications we've seen for public BCs have been buying drugs, allowing douchy tech bros to make a lot of money on pyramid schemes, and allowing douchy tech bros to lose a lot of money on pyramid schemes
    - Blockchains are awesome. They got popular for a reason. the idea that anyone in the world can join this decentralized, trustless network and all agree on the state of the world is really cool and revolutionary. And even if we're not quite there yet in the public BC space, there are real world application for enterprise private networks, where ~ 4-50 entities who don't trust each other, but need to coordinate: supply chain management, asset reconciliation, health care data
    - WebRTC is awesome. before i worked in blockchain, i was a web developer, and made a lot of stupid projects in my free time. i always thought setting up central servers was a drag, so when i heard that you could use webrtc to send audio, video, text in p2p communication, i thought that was really cool.
  - 3 min
    - So, let's build a blockchain with WebRTC, because why the hell not?
    - But first, what exactly is a blockchain?
      - MW actually has a definition: "a digital database containing information ... that can be simultaneously used and shared within a large decentralized, publicly accessible network"
      - Actually isn't a terrible deifnition, but if that sounds vague as hell, it's because it is vague as hell. No one can actually agree on a definition that's more specific than this.
      - IMO there are some definitive traits of blockchains that this definition leaves out (such as BFT, tx ordering)
      - So for the purposes of this demo, and because i have the mic, we're going to define a blockchain as: a network of nodes (web browsers) with BFT that can come to a consensus on the order of events
      - the digital db part is really a result of agreeing on txs and their order
      - if you're curious where the blocks or the chains come in, then that's a valid concern, but don't worry about it for now

    - Caveats:
      - Depending on your definition of blockchain, what i built might not actually be one. But "Building a Decentralized Ledger with WebRTC" doesn't quit sound as sexy, so we're gonna roll with this
      - I'm not an expert on WebRTC. This project is literally the extent of my knowledge
      - I work at a company that built its own blockchain, but spend most of my time on the smart contract layer
      - Blockchains are really really complicated, so I had to cut a lot of corners to get something I could explain in 15 minutes


Why?
  Blockchains are fucking cool
  WebRTC is fucking cool

Caveats
  No practical use for this
  I'm not an expert on WebRTC.
  some people might not actually consider this a blockchain. At very least a DLT. illustrates the architecture; can swap out the network layer for something more blockchainy
  To be really precise and pedantic, we will build a network of web browsers (nodes) that agree on the order of events, such that only we have 3f+1 honest nods


Output
  Let's create a blockchain chat application where, for some reason, you really really care about the integrety of your chat history. So, you don't want facebook or google, or one of the chat participants to rewrite history. Additionally, for some reason, you really really care that everyone int he chat agrees on the order of the messages, and no one can mess it up. So basically, we're building a chat app that's super fucking air tight against the attack where someone says something to piss you off, you respond, then they delete their original message and you look like a crazy person.


WebRTC
  WebRTC sounds really fucking cool. Here are the descriptions of two components;
  https://www.html5rocks.com/en/tutorials/webrtc/basics/#toc-rtcdatachannel
  RTCDataChannel
  """
    There are many potential use cases for the API, including:
    Gaming
    Remote desktop applications
    Real-time text chat
    File transfer
    Decentralized networks
  """
  Cool, we want to build a decentralized network. Sounds like that's up our alley

  https://www.html5rocks.com/en/tutorials/webrtc/basics/#toc-rtcpeerconnection
  RTCPeerConnection
  """
    RTCPeerConnection is the WebRTC component that handles stable and efficient communication of streaming data between peers.
  """

  Great. But diving into WebRTC is incredibly opaque. right out of the gate a lot of terminology is thrown around.WTF is a peerconnection? a track? an ICE candidate? Why are we dragging politics into this?


  `RTCPeerConnection`
    "The RTCPeerConnection interface represents a WebRTC connection between the local computer and a remote peer. It provides methods to connect to a remote peer, maintain and monitor the connection, and close the connection once it's no longer needed."
    https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection

  `RTCIceCandidate`
  "The RTCIceCandidate interface—part of the WebRTC API—represents a candidate Internet Connectivity Establishment (ICE) configuration which may be used to establish an RTCPeerConnection.
  An ICE candidate describes the protocols and routing needed for WebRTC to be able to communicate with a remote device. When starting a WebRTC peer connection, typically a number of candidates are proposed by each end of the connection, until they mutually agree upon one which describes the connection they decide will be best. WebRTC then uses that candidate's details to initiate the connection."
  https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate



The official docs link to this session lifetime page. Wehn you click the link you're greeted with a friendly "This page is not complete" message. But nevertheless, it gives a good overview
https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Session_lifetime

"The problem for users is that each individual computer on the Internet no longer necessarily has a unique IP address ... For developers trying to do peer-to-peer networking, this introduces a conundrum: without a unique identifier for every user device, it’s not possible to instantly and automatically know how to connect to a specific device on the Internet. "

"Signaling is the process of sending control information between two devices to determine the communication protocols, channels, media codecs and formats, and method of data transfer, as well as any required routing information. The most important thing to know about the signaling process for WebRTC: it is not defined in the specification."

"... the channel for performing signaling doesn’t even need to be over the network. One peer can output a data object that can be printed out, physically carried (on foot or by carrier pigeon) to another device, entered into that device, and a response then output by that device to be returned on foot, and so forth, until the WebRTC peer connection is open."


Here's a datachannel example
https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel


Here is the evedent workflow
  let someConfig = {}
  let pc1 = new RTCPeerConnection(someConfig) // create the local connection
  let pc2 = new RTCPeerConnection(someConfig) // create the local connection

  pc1.onicecandidate = event => pc2.addIceCandidate(event.candidate)
  pc2.onicecandidate = event => pc1.addIceCandidate(event.candidate)

# THIS LOOKS LIKE A REALLY GOOD DATA CHANNEL EXAMPLE
https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Simple_RTCDataChannel_sample
