import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {VocalBridgeProvider,useVocalBridge,useAgentActions,useTranscript} from '@vocalbridgeai/react';
import {ConnectionState} from '@vocalbridgeai/sdk';
import {GameView} from './GameView';
import {useGameController} from '../hooks/useGameController';
import {parsePosition,snapshot} from '../game/engine';

async function tokenProvider(){
  const response=await fetch('/api/voice-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({participant_name:'Tic Tac Toe Player'})});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.detail||'Unable to connect to token server.');}
  return response.json();
}

const VOICE_PREVIEW_MS=450; // how long a spoken square glows before the mark lands
const HEARD_VISIBLE_MS=3200;
const LOCAL_BOT_DELAY_MS=400;

function ConnectedGame(){
  const {state,connect,disconnect,error,client}=useVocalBridge();
  const {transcript:rawTranscript=[]}=useTranscript();
  // The SDK appends every send_transcript message it receives; the service can
  // deliver the same agent line twice. Collapse back-to-back identical lines
  // from the same speaker that arrive within a few seconds of each other.
  const transcript=useMemo(()=>rawTranscript.filter((t,i)=>{
    const prev=rawTranscript[i-1];
    return !(prev&&prev.role===t.role&&prev.text.trim()===t.text.trim()&&Math.abs((t.timestamp||0)-(prev.timestamp||0))<8000);
  }),[rawTranscript]);
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

  // --- Agent-turn watchdog (voice only) ------------------------------------
  // After a spoken move the app only emits board_sync (notify), which does NOT
  // trigger an agent response. If the agent's place_mark never arrives, the
  // game would stall on "Bot is thinking", so after FALLBACK_AFTER_MS a local
  // move is played SILENTLY. We deliberately do not send a timed "respond"
  // re-prompt: the agent is often just slow, and a nudge makes it speak a
  // second, stale reply ("Sorry for the mix-up… that square is already mine").
  // A respond re-prompt is sent only when a place_mark is actually rejected.
  const FALLBACK_AFTER_MS=8000, EARLY_MARK_TTL_MS=1500;
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
    if(!connectedRef.current)return; // the local bot handles moves offline
    const {revision}=ctrlRef.current.getCurrent();
    timers.current.push(setTimeout(()=>{
      if(!stillWaitingOn(revision))return;
      ctrlRef.current.addLog('error','Agent did not move; playing a fallback move');
      ctrlRef.current.agentAuto();
    },FALLBACK_AFTER_MS));
  },[clearWatchdog,stillWaitingOn]);
  useEffect(()=>clearWatchdog,[clearWatchdog]);
  useEffect(()=>{if(!connected)clearWatchdog();},[connected,clearWatchdog]);

  // --- Spoken-move preview: glow the square briefly, then place the mark ----
  const [picked,setPicked]=useState(null);
  const previewTimer=useRef(null);
  const cancelPreview=useCallback(()=>{clearTimeout(previewTimer.current);previewTimer.current=null;setPicked(null);},[]);
  useEffect(()=>()=>clearTimeout(previewTimer.current),[]);

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
    start:opts=>{clearWatchdog();cancelPreview();earlyMark.current=null;const g=ctrl.start(opts);if(g.turn==='agent')armWatchdog();return g;},
    clear:()=>{clearWatchdog();cancelPreview();earlyMark.current=null;ctrl.clear();}};

  useEffect(()=>{
    const unsubs=[
      onAction('show_tic_tac_toe',payload=>{clearWatchdog();cancelPreview();earlyMark.current=null;ctrlRef.current.addLog('agent','Agent: show_tic_tac_toe');const g=ctrlRef.current.start(payload||{});if(g.turn==='agent')armWatchdog();}),
      onAction('clear_ui',()=>{clearWatchdog();cancelPreview();earlyMark.current=null;ctrlRef.current.addLog('agent','Agent: clear_ui');ctrlRef.current.clear();}),
      onAction('user_move',payload=>{
        ctrlRef.current.addLog('agent','Agent: user_move');
        const pos=parsePosition(payload);
        const g=ctrlRef.current.getCurrent();
        const playable=pos!==null&&g.status==='playing'&&g.turn==='user'&&g.board[pos]===null;
        if(!playable){afterUserMove(ctrlRef.current.move(pos,'user','voice'));return;}
        // Show which square was understood, then commit. A place_mark arriving
        // meanwhile is held by the early-mark logic below and applied afterwards.
        clearTimeout(previewTimer.current);
        setPicked(pos);
        previewTimer.current=setTimeout(()=>{
          previewTimer.current=null;setPicked(null);
          afterUserMove(ctrlRef.current.move(pos,'user','voice'));
        },VOICE_PREVIEW_MS);
      }),
      onAction('place_mark',payload=>{
        ctrlRef.current.addLog('agent','Agent: place_mark');
        const pos=parsePosition(payload);
        const g=ctrlRef.current.getCurrent();
        // place_mark delivered before user_move lands (e.g. during the preview
        // glow): hold it briefly (EARLY_MARK_TTL_MS) and apply after the user's
        // mark. Anything older is discarded, so a stray duplicate is not replayed.
        if(g.status==='playing'&&g.turn==='user'){earlyMark.current={pos,at:Date.now()};ctrlRef.current.addLog('event','Holding agent move until your move lands');return;}
        applyAgentMark(pos);
      })
    ];
    return ()=>unsubs.forEach(fn=>{if(typeof fn==='function')fn()});
  },[onAction,afterUserMove,applyAgentMark,armWatchdog,clearWatchdog,cancelPreview]);

  // Start with a board ready to play.
  useEffect(()=>{ctrlRef.current.start();},[]);

  // Without a voice connection the local bot plays O.
  const {status,turn,revision}=ctrl.game;
  useEffect(()=>{
    if(connected||status!=='playing'||turn!=='agent')return;
    const t=setTimeout(()=>ctrlRef.current.agentAuto(),LOCAL_BOT_DELAY_MS);
    return ()=>clearTimeout(t);
  },[connected,status,turn,revision]);

  // When voice connects mid-game, tell the agent where things stand.
  useEffect(()=>{if(connected)send('board_sync',snapshot(ctrlRef.current.getCurrent()));},[connected,send]);

  // "Heard: …" caption from the latest user utterance.
  const lastHeard=useMemo(()=>{for(let i=transcript.length-1;i>=0;i--)if(transcript[i]?.role==='user')return transcript[i];return null;},[transcript]);
  const [heard,setHeard]=useState('');
  useEffect(()=>{
    if(!lastHeard?.text)return;
    setHeard(lastHeard.text);
    const t=setTimeout(()=>setHeard(''),HEARD_VISIBLE_MS);
    return ()=>clearTimeout(t);
  },[lastHeard?.text,lastHeard?.timestamp]);

  const toggle=async()=>{setVoiceError('');try{if(connected)await disconnect();else await connect()}catch(e){setVoiceError(e.message||'Connection failed')}};
  return <GameView controller={viewCtrl} connected={connected} busy={busy} onMic={toggle} room={connected?client?.room:null}
    heard={heard} picked={picked} voiceError={voiceError||error?.message} transcript={transcript}/>;
}

export function VoiceGame(){return <VocalBridgeProvider options={{auth:{tokenProvider},debug:false}}><ConnectedGame/></VocalBridgeProvider>}
