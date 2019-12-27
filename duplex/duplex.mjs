
const $offering = document.getElementById('offering')
const $answer = document.getElementById('answer')

const $createOffering = document.getElementById('create-offering')
const $acceptOffering = document.getElementById('accept-offering')

const $offeringOut = document.getElementById('offering-out')
const $offeringCandidateOut = document.getElementById('offering-candidate-out')

const $answerIn = document.getElementById('answer-in')
const $answerCandidateIn = document.getElementById('answer-candidate-in')

const $offeringIn = document.getElementById('offering-in')
const $offeringCandidateIn = document.getElementById('offering-candidate-in')
const $answerOut = document.getElementById('answer-out')
const $answerCandidateOut = document.getElementById('answer-candidate-out')
const $createAnswer = document.getElementById('create-answer')
const $acceptAnswer = document.getElementById('accept-answer')

const $chatHistoryResults = document.getElementById('chat-history-results')
const $newMessage = document.getElementById('new-message')
const $sendMessage = document.getElementById('send-message')



let localConnection, remoteConnection, channel

$createOffering.onclick = () => {
  $offering.style.display = ''
  createOffering()
}

$acceptOffering.onclick = () => {
  $answer.style.display = ''
}


$createAnswer.onclick = () => {
  acceptOffering(
    JSON.parse($offeringIn.value),
    JSON.parse($offeringCandidateIn.value),
  )
}

$acceptAnswer.onclick = () => {
  acceptAnswer(
    localConnection,
    JSON.parse($answerIn.value),
    JSON.parse($answerCandidateIn.value),
  )
}


$sendMessage.onclick = () => {
  const input = $newMessage.value
  if (!input) return

  $newMessage.value = ''
  updateChat(input)
  sendMessage(input)
}


function updateChat(input) {
  $chatHistoryResults.innerHTML += '<br>' + input
}




function sendMessage(input) {
  channel.send(input)
}



function createOffering() {
  localConnection = new RTCPeerConnection()

  localConnection.onconnectionstatechange = () => {
    console.log("local connection state change:", localConnection.connectionState)
  }

  localConnection.onicecandidate = e => {
    console.log("local candidate created")
    if (e.candidate) {
      displayRemoteOfferingInfo(localConnection.localDescription, e.candidate)
    }
  }


  channel = localConnection.createDataChannel('chat')
  channel.onmessage = evt => updateChat(evt.data)


  console.log("creating offering")
  localConnection.createOffer()
    .then(offer => localConnection.setLocalDescription(offer))
    .catch(console.log)
}

function displayRemoteOfferingInfo(description, candidate) {
  $offeringOut.innerHTML = JSON.stringify(description, null, 3)
  $offeringCandidateOut.innerHTML = JSON.stringify(candidate, null, 3)
}

updateChat







function acceptOffering(offering, candidate) {
  remoteConnection = new RTCPeerConnection()

  remoteConnection.onconnectionstatechange = () => {
    console.log("remote connection state change:", remoteConnection.connectionState)
  }

  remoteConnection.onicecandidate = e => {
    console.log("remote candidate created")
    if (e.candidate) {
      displayRemoteAnswerInfo(remoteConnection.localDescription, e.candidate)
    }
  }

  remoteConnection.ondatachannel = e => {
    console.log('remote ondatachannel')
    channel = e.channel
    channel.onmessage = evt => updateChat(evt.data)
  }

  remoteConnection.setRemoteDescription(offering)
  remoteConnection.addIceCandidate(candidate).catch(console.log);

  remoteConnection.createAnswer()
    .then(answer => remoteConnection.setLocalDescription(answer))
}

function displayRemoteAnswerInfo(answer, candidate) {
    $answerOut.innerHTML = JSON.stringify(answer, null, 3)
    $answerCandidateOut.innerHTML = JSON.stringify(candidate, null, 3)
}


function acceptAnswer(connection, answer, candidate) {
  connection.setRemoteDescription(answer)
  connection.addIceCandidate(candidate)
    .then(() => console.log("answer accepted"))
    .catch(console.log);

}


// // The events play out in this order
//   // create A and B + handler setup
//   // A creates a data channel
//   // A creates a connection offering. This configures the connection.
//   // A sets the offering as its local description (which triggers the icecandidate event).
//   // A sends the offering + its candidate info to B

//   // B sets A's offering as it's remote description
//   // B add's A as an ICE candidate
//   // B creates an answer, and sets that to its local description
//   // B sends its answer + candidate info back to A

//   // A sets the answer as its remote description
//   // A adds B as an ICE candidate
