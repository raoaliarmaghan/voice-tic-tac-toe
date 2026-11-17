import {useState} from 'react';
import {GameView} from './components/GameView';
import {VoiceGame} from './components/VoiceGame';
import {useGameController} from './hooks/useGameController';
function DemoGame(){const controller=useGameController({demo:true});return <GameView mode="demo" controller={controller}><button className="voice-btn" disabled>Voice unavailable in demo</button><p className="microcopy">Mouse moves work without API credentials</p></GameView>}
export default function App(){const [mode,setMode]=useState('demo');return <><div className="mode-picker" role="group" aria-label="App mode"><button className={mode==='demo'?'active':''} onClick={()=>setMode('demo')}>Local Demo</button><button className={mode==='voice'?'active':''} onClick={()=>setMode('voice')}>Live Voice</button></div>{mode==='demo'?<DemoGame key="demo"/>:<VoiceGame key="voice"/>}</>}
