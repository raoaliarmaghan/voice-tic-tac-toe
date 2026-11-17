import {useCallback,useRef,useState} from 'react';
import {idleGame,newGame,makeMove,chooseAgentMove,snapshot} from '../game/engine';

export function useGameController({onEvent=()=>{}, demo=false}={}) {
  const [game,setGame]=useState(idleGame);
  const [history,setHistory]=useState([]);
  const ref=useRef(game);
  const emit=useRef(onEvent);emit.current=onEvent;
  const demoRef=useRef(demo);demoRef.current=demo;
  const addLog=useCallback((kind,message)=>setHistory(v=>[{id:Date.now()+Math.random(),time:new Date().toLocaleTimeString(),kind,message},...v].slice(0,50)),[]);
  const setCurrent=useCallback(g=>{ref.current=g;setGame(g)},[]);
  const notify=useCallback((name,payload)=>{emit.current(name,payload);addLog(name==='board_sync'?'sync':name==='user_placed_mark'?'event':'action',name)},[addLog]);
  const start=useCallback((options={})=>{
    const g=newGame(options.userSymbol,options.firstTurn,ref.current.revision+1);setCurrent(g);addLog('game','New match started');notify('board_sync',snapshot(g));
    if(demoRef.current && g.turn==='agent')setTimeout(()=>agentAuto(),300);
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[setCurrent,notify,addLog]);
  const clear=useCallback(()=>{const g={...idleGame(),revision:ref.current.revision+1};setCurrent(g);addLog('game','Board cleared');notify('board_sync',snapshot(g));},[setCurrent,addLog,notify]);
  const move=useCallback((position,actor,source='voice')=>{
    const {game:g,error}=makeMove(ref.current,position,actor);
    if(error){addLog('error',error);return {ok:false,error};}
    setCurrent(g);
    const state=snapshot(g);
    if(source==='click')notify('user_placed_mark',{...state,position,row:Math.floor(position/3),col:position%3,mark:g.userSymbol});
    notify('board_sync',state);
    addLog('move',`${actor==='user'?'You':'Agent'} played square ${position+1}`);
    return {ok:true,game:g};
  },[setCurrent,notify,addLog]);
  const agentAuto=useCallback(()=>{const p=chooseAgentMove(ref.current);if(p!==null)return move(p,'agent','demo');return {ok:false,error:'Not agent turn'}},[move]);
  const click=useCallback(position=>{
    const result=move(position,'user','click');
    if(result.ok && demoRef.current && result.game.status==='playing')setTimeout(()=>agentAuto(),350);
    return result;
  },[move,agentAuto]);
  return {game,history,addLog,start,clear,move,click,agentAuto,getCurrent:()=>ref.current};
}
