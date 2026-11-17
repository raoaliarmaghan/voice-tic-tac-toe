import {useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Loader2,RotateCcw} from 'lucide-react';
import {winnerOf,POSITIONS} from '../game/engine';
import {VoiceBars} from './VoiceBars';

const ENDED=['user_wins','agent_wins','draw'];
const CENTER=[50,150,250]; // cell centres in a 300×300 viewBox

function WinLine({line,status}){
  if(line.length!==3)return null;
  const [a,,c]=line;
  const x1=CENTER[a%3],y1=CENTER[Math.floor(a/3)],x2=CENTER[c%3],y2=CENTER[Math.floor(c/3)];
  const dx=Math.sign(x2-x1)*30,dy=Math.sign(y2-y1)*30; // run slightly past the end cells
  return <svg className={`win-line ${status==='user_wins'?'win-x':'win-o'}`} viewBox="0 0 300 300" aria-hidden="true">
    <line x1={x1-dx} y1={y1-dy} x2={x2+dx} y2={y2+dy} pathLength="1"/>
  </svg>;
}

function statusText(game,connected){
  if(game.status==='user_wins')return 'You win!';
  if(game.status==='agent_wins')return 'Bot wins this one.';
  if(game.status==='draw')return "It's a draw.";
  if(game.status!=='playing')return 'Press New game to start.';
  if(game.turn==='user')return connected?"Your turn — say 'center' or click a square.":'Your turn — click a square or press 1–9.';
  return 'Bot is thinking…';
}

const SUGGESTIONS=["Let's play tic-tac-toe",'Put X in the center','Top left corner','Start a new game'];

function VoicePanel({transcript,connected}){
  const listRef=useRef(null);
  useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight;},[transcript.length]);
  return <aside className="voice-panel" aria-label="Voice help and transcript">
    <h2 className="panel-title">Try saying</h2>
    <ul className="suggestions">{SUGGESTIONS.map(s=><li key={s}>“{s}”</li>)}</ul>

    <h2 className="panel-title">Live transcript {connected&&<span className="live-dot" aria-label="live"/>}</h2>
    <div className="transcript" ref={listRef} aria-live="polite">
      {transcript.length
        ?transcript.map((t,i)=><div key={`${t.timestamp??i}-${i}`} className={`line line-${t.role==='user'?'user':'agent'}`}>
            <span className="who">{t.role==='user'?'You':'Bot'}</span><p>{t.text}</p>
          </div>)
        :<p className="transcript-empty">{connected?'Listening — start talking.':'Press Connect Voice to start talking. The conversation will appear here.'}</p>}
    </div>
  </aside>;
}

export function GameView({controller,connected=false,busy=false,onMic,room=null,heard='',picked=null,voiceError='',transcript=[]}){
  const {game,start,click}=controller;
  const {line}=winnerOf(game.board);
  const ended=ENDED.includes(game.status);
  const canPlay=game.visible&&game.status==='playing'&&game.turn==='user';

  // Running score for this page visit; each finished game is counted once.
  const [score,setScore]=useState({user:0,agent:0,draw:0});
  const counted=useRef(null);
  useEffect(()=>{
    if(!ended||counted.current===game.revision)return;
    counted.current=game.revision;
    const key=game.status==='user_wins'?'user':game.status==='agent_wins'?'agent':'draw';
    setScore(s=>({...s,[key]:s[key]+1}));
  },[ended,game.status,game.revision]);

  // Keys 1–9 play the matching square.
  useEffect(()=>{
    const onKey=e=>{
      if(e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
      const n=Number(e.key);
      if(!Number.isInteger(n)||n<1||n>9)return;
      if(canPlay&&!game.board[n-1]){e.preventDefault();click(n-1);}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[canPlay,game.board,click]);

  const turn=game.status==='playing'?game.turn:null;
  return <div className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><span>×</span><span>○</span></div>
        <div><div className="brand-title">VOCAL<span>GRID</span></div><div className="brand-sub">ARMAGHAN LABS</div></div>
      </div>
      {import.meta.env.BASE_URL!=='/'&&<a className="back-link" href="/">← Back to portfolio</a>}
    </header>

    <main>
      <div className="hero">
        <h1>Make your <em>move.</em><br/>Just say the word.</h1>
        <p>Connect voice and call a square, or just click one.</p>
      </div>

      <div className="play-area">
      <section className="game" aria-label="Tic-tac-toe">
        <div className="voice">
          <VoiceBars room={room} connected={connected}/>
          <button className={`connect ${connected?'connect-live':''}`} onClick={onMic} disabled={busy} aria-pressed={connected}>
            {busy?<Loader2 className="spin" size={18}/>:connected?<MicOff size={18}/>:<Mic size={18}/>}
            {busy?'Connecting…':connected?'Disconnect Voice':'Connect Voice'}
          </button>
          <div className="heard" aria-live="polite">{heard?<span key={heard}>Heard: “{heard}”</span>:connected?<em>Listening — call a square.</em>:null}</div>
          {voiceError&&<p className="error" role="alert">{voiceError}</p>}
        </div>

        <div className="scores">
          <div className={`score ${turn==='user'?'current':''}`}>
            <span className="symbol x">{game.userSymbol}</span><span className="name">YOU</span><strong className="points">{score.user}</strong>
          </div>
          <div className="draws"><strong>{score.draw}</strong>DRAWS</div>
          <div className={`score ${turn==='agent'?'current':''}`}>
            <span className="symbol o">{game.agentSymbol}</span><span className="name">BOT</span><strong className="points">{score.agent}</strong>
          </div>
        </div>

        <div className="board">
          <div className="board-grid">
            {game.board.map((cell,i)=><button key={i}
              aria-label={`${i+1}, ${POSITIONS[i]}, ${cell||'empty'}`} title={POSITIONS[i]}
              disabled={!canPlay||Boolean(cell)} onClick={()=>click(i)}
              className={`square ${cell===game.agentSymbol?'square-o':''} ${line.includes(i)?'square-winning':''} ${picked===i?'square-picked':''}`}>
              {cell?<span className="mark">{cell}</span>:<span className="num">{i+1}</span>}
            </button>)}
          </div>
          <WinLine line={line} status={game.status}/>
        </div>

        <p className={`status ${ended?'ended':''} ${game.status==='user_wins'?'win':game.status==='agent_wins'?'loss':''}`} aria-live="polite">{statusText(game,connected)}</p>

        <button className={`new-game ${ended?'emphasis':''}`} onClick={()=>start()}><RotateCcw size={16}/> New game</button>
      </section>
      <VoicePanel transcript={transcript} connected={connected}/>
      </div>
    </main>

    <footer>© Armaghan Labs</footer>
  </div>;
}
