import React, {useState, useEffect} from 'react';
import {Node} from './network'


const Multiple = () => {
  const [remoteNodeId, setRemoteNodeId] = useState<string>('')
  const [formState, setFormState] = useState<'' | 'create' | 'accept'>('')
  const [networkInvitations, setNetworkInvitations] = useState<string>('')
  const [receivingNetworkInvitations, setReceivingNetworkInvitations] = useState<string>('')
  const [answers, setAnswers] = useState<string>('')
  const [acceptingAnswers, setAcceptingAnswers] = useState<string>('')
  const [node, setNode] = useState<Node | null>(null)
  const [log, setLog] = useState<Array<any>>([])
  const [txInput, setTxInput] = useState<string>('')

  useEffect(() => {
    const node = new Node(setLog)
    setNode(node)
    // @ts-ignore
    window.node = node
  }, [])

  return (
    <div className="Multiple">
      <h1>{node?.id}</h1>

      {node && !!Object.keys(node.connections).length &&
        <div>
          <ol>
            {log.map(item => <li key={item}>{JSON.stringify(item)}</li>)}
          </ol>
          <input value={txInput} onChange={e => setTxInput(e.target.value)} />
          <button onClick={() => {
            node?.postTxEvent(txInput)
            setTxInput('')
          }}>Send</button>
        </div>
      }


      <div>
        <input value={remoteNodeId} onChange={e => setRemoteNodeId(e.target.value)} />
        <button onClick={() => {
          node?.collectNetworkInvitations(remoteNodeId)
            .then(invitations => setNetworkInvitations(JSON.stringify(invitations)))

          setFormState('create')
        }}>Create Invitation</button>
      </div>
      <button onClick={() => setFormState('accept')}>Accept Invitation</button>

      {formState === 'create' && <div>
        <h2>Invitation</h2>
        <textarea readOnly value={networkInvitations}/>

        <h2>Answer</h2>
        <textarea
          onChange={e => setAcceptingAnswers(e.target.value)}
          value={acceptingAnswers}
        />

        <button onClick={() => node?.acceptAnswers(JSON.parse(acceptingAnswers))}>Accept Answers</button>

      </div>}

      {formState === 'accept' && <div>
        <h2>Invitation</h2>
        <textarea
          onChange={e => setReceivingNetworkInvitations(e.target.value)}
          value={receivingNetworkInvitations}
        />
        <button onClick={() => {
          node?.createAnswers(JSON.parse(receivingNetworkInvitations))
            .then(answers => setAnswers(JSON.stringify(answers)))
        }}>
          Accept Invitation
        </button>

        <h2>Answer</h2>
        <textarea
          readOnly
          value={answers}
        />

      </div>}
    </div>
  );
}

export default Multiple;
