import {useCallback,useEffect,useRef,useState} from 'react';
import {VocalBridgeProvider,useVocalBridge,useAgentActions,useTranscript} from '@vocalbridgeai/react';
import {ConnectionState} from '@vocalbridgeai/sdk';
import {Mic,MicOff,PhoneOff,PlugZap,Radio,Volume2} from 'lucide-react';
import {GameView} from './GameView';
import {useGameController} from '../hooks/useGameController';
import {parsePosition,snapshot} from '../game/engine';

async function tokenProvider(){
  const response=await fetch('/api/voice-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({participant_name:'Tic Tac Toe Player'})});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.detail||'Unable to connect to token server.');}
  return response.json();
}

function ConnectedGame(){
  const {state,connect,disconnect,error}=useVocalBridge();
  const {transcript=[]}=useTranscript();
  const {onAction,sendAction}=useAgentActions();
  const [voiceError,setVoiceError]=useState('');
  const connected=state===ConnectionState.Connected || state==='connected';
  const busy=state===ConnectionState.Connecting||state===ConnectionState.WaitingForAgent||state==='connecting';
  const connectedRef=useRef(connected);connectedRef.current=connected;
  const send=useCallback((name,payload)=>{
    if(!connectedRef.current)return;
    Promise.resolve(sendAction(name,payload)).catch(e=>setVoiceError(`Could not send ${name}: ${e.message}`));
  },[sendAction]);
  const ctrl=useGameController({onEvent:send});
  const ctrlRef=useRef(ctrl);ctrlRef.current=ctrl;

  // --- Agent-turn watchdog -------------------------------------------------
  // After a spoken move the app only emits board_sync (notify), which does NOT
  // trigger an agent response. If the agent's place_mark is missing, arrives
  // before user_move, or targets an occupied square, the game would stall on
  // "Agent is thinking". The watchdog re-prompts the agent with
  // user_placed_mark (respond) and finally falls back to a local move.
  const PROMPT_AFTER_MS=1800, FALLBACK_AFTER_MS=6000, EARLY_MARK_TTL_MS=2500;
  const timers=useRef([]);
  const earlyMark=useRef(null); // place_mark that arrived before the user's move
  const clearWatchdog=useCallback(()=>{timers.current.forEach(clearTimeout);timers.current=[];},[]);
  const stillWaitingOn=useCallback(revision=>{const g=ctrlRef.current.getCurrent();return g.status==='playing'&&g.turn==='agent'&&g.revision===revision;},[]);
  const promptAgent=useCallback((reason)=>{
    const g=ctrlRef.current.getCurrent();
    const last=g.lastMove;
    ctrlRef.current.addLog('event',`Re-prompting agent (${reason})`);
    send('user_placed_mark',{...snapshot(g),position:last?.position??null,row:last?Math.floor(last.position/3):null,col:last?last.position%3:null,mark:g.userSymbol,note:`${reason}. It is your turn: call place_mark on an EMPTY square.`});
  },[send]);
  const armWatchdog=useCallback(()=>{
    clearWatchdog();
    const {revision}=ctrlRef.current.getCurrent();
    timers.current.push(setTimeout(()=>{if(stillWaitingOn(revision))promptAgent('no agent move received');},PROMPT_AFTER_MS));
    timers.current.push(setTimeout(()=>{
      if(!stillWaitingOn(revision))return;
      ctrlRef.current.addLog('error','Agent did not move; playing a fallback move');
      ctrlRef.current.agentAuto();
    },FALLBACK_AFTER_MS));
  },[clearWatchdog,stillWaitingOn,promptAgent]);
  useEffect(()=>clearWatchdog,[clearWatchdog]);
  useEffect(()=>{if(!connected)clearWatchdog();},[connected,clearWatchdog]);

  const applyAgentMark=useCallback(pos=>{
    const res=ctrlRef.current.move(pos,'agent','voice');
    if(res.ok){clearWatchdog();return res;}
    // Rejected while it IS the agent's turn (occupied / invalid): ask again now.
    const g=ctrlRef.current.getCurrent();
    if(g.status==='playing'&&g.turn==='agent')promptAgent(`your place_mark was rejected: ${res.error}`);
    return res;
  },[clearWatchdog,promptAgent]);
  const afterUserMove=useCallback(res=>{
    if(!res.ok||res.game.status!=='playing'||res.game.turn!=='agent')return;
    const early=earlyMark.current;earlyMark.current=null;
    if(early&&Date.now()-early.at<EARLY_MARK_TTL_MS&&applyAgentMark(early.pos).ok)return;
    armWatchdog();
  },[applyAgentMark,armWatchdog]);
  // Clicks already send user_placed_mark (respond); still guard against a stall.
  const viewCtrl={...ctrl,
    click:pos=>{const res=ctrl.click(pos);if(res.ok&&res.game.status==='playing'&&res.game.turn==='agent')armWatchdog();return res;},
    start:opts=>{clearWatchdog();earlyMark.current=null;const g=ctrl.start(opts);if(g.turn==='agent')armWatchdog();return g;},
    clear:()=>{clearWatchdog();earlyMark.current=null;ctrl.clear();}};

  useEffect(()=>{
    const unsubs=[
      onAction('show_tic_tac_toe',payload=>{clearWatchdog();earlyMark.current=null;ctrlRef.current.addLog('agent','Agent: show_tic_tac_toe');const g=ctrlRef.current.start(payload||{});if(g.turn==='agent')armWatchdog();}),
      onAction('clear_ui',()=>{clearWatchdog();earlyMark.current=null;ctrlRef.current.addLog('agent','Agent: clear_ui');ctrlRef.current.clear();}),
      onAction('user_move',payload=>{
        ctrlRef.current.addLog('agent','Agent: user_move');
        const pos=parsePosition(payload);
        afterUserMove(ctrlRef.current.move(pos,'user','voice'));
      }),
      onAction('place_mark',payload=>{
        ctrlRef.current.addLog('agent','Agent: place_mark');
        const pos=parsePosition(payload);
        const g=ctrlRef.current.getCurrent();
        // place_mark delivered before user_move in the same response: hold it briefly.
        if(g.status==='playing'&&g.turn==='user'){earlyMark.current={pos,at:Date.now()};ctrlRef.current.addLog('event','Holding agent move until your move lands');return;}
        applyAgentMark(pos);
      })
    ];
    return ()=>unsubs.forEach(fn=>{if(typeof fn==='function')fn()});
  },[onAction,afterUserMove,applyAgentMark,armWatchdog,clearWatchdog]);
  const toggle=async()=>{setVoiceError('');try{if(connected)await disconnect();else await connect()}catch(e){setVoiceError(e.message||'Connection failed')}};
  return <GameView mode="voice" controller={viewCtrl} transcript={transcript} connection={state} voiceError={voiceError||error?.message}>
    <button className={`voice-btn ${connected?'connected':''}`} disabled={busy} onClick={toggle}>
      {connected?<PhoneOff size={18}/>:busy?<Radio size={18}/>:<Mic size={18}/>}
      {connected?'Disconnect voice':busy?'Connecting…':'Connect voice'}
    </button>
    <p className="microcopy">{connected?'Microphone live · speak a move':'Connect to speak commands'} </p>
  </GameView>;
}

export function VoiceGame(){return <VocalBridgeProvider options={{auth:{tokenProvider},debug:false}}><ConnectedGame/></VocalBridgeProvider>}
