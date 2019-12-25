Building a blockchain in the browser with WebRTC

Why?
  Blockchains are fucking cool
  WebRTC is fucking cool

Caveats
  No practical use for this
  I'm not an expert on WebRTC. This project is literally the extent of my knowledge
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
