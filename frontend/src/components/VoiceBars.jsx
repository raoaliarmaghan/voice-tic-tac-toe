import {useEffect,useRef} from 'react';

const HALF=14; // bars per side; the strip is mirrored around the centre
const BARS=HALF*2;
const IDLE_SCALE=0.12;

// Live audio bars driven by the mic (you) and the agent's voice track.
// Bars are written straight to the DOM each frame so React does not re-render.
export function VoiceBars({room,connected}){
  const wrapRef=useRef(null);
  const barsRef=useRef([]);

  useEffect(()=>{
    if(!connected||!room)return;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    const ctx=new Ctx();
    ctx.resume?.().catch(()=>{});
    const taps=new Map(); // MediaStreamTrack id -> analyser tap

    const liveTracks=()=>{
      const out=[];
      const add=(participant,who)=>participant?.audioTrackPublications?.forEach(pub=>{
        const t=pub.track?.mediaStreamTrack;
        if(t&&t.readyState==='live')out.push({t,who});
      });
      add(room.localParticipant,'user');
      room.remoteParticipants?.forEach(p=>add(p,'agent'));
      return out;
    };
    const sync=()=>{
      const live=liveTracks();
      const ids=new Set(live.map(x=>x.t.id));
      live.forEach(({t,who})=>{
        if(taps.has(t.id))return;
        try{
          const source=ctx.createMediaStreamSource(new MediaStream([t]));
          const analyser=ctx.createAnalyser();
          analyser.fftSize=128;analyser.smoothingTimeConstant=0.72;
          source.connect(analyser);
          taps.set(t.id,{source,analyser,who,data:new Uint8Array(analyser.frequencyBinCount)});
        }catch{/* track not ready yet; retry on next sync */}
      });
      taps.forEach((tap,id)=>{if(!ids.has(id)){tap.source.disconnect();taps.delete(id);}});
    };
    sync();
    const syncTimer=setInterval(sync,500);

    let raf;
    const levels=new Float32Array(HALF);
    const frame=()=>{
      levels.fill(0);
      const energy={user:0,agent:0};
      taps.forEach(tap=>{
        tap.analyser.getByteFrequencyData(tap.data);
        for(let j=0;j<HALF;j++){
          const v=tap.data[j+1]/255; // skip DC bin; bins 1..14 cover the speech band
          if(v>levels[j])levels[j]=v;
          energy[tap.who]+=v;
        }
      });
      const bars=barsRef.current;
      for(let j=0;j<HALF;j++){
        const s=Math.max(IDLE_SCALE,Math.min(1,Math.pow(levels[j],1.4)*1.15));
        const left=bars[HALF-1-j],right=bars[HALF+j];
        if(left)left.style.transform=`scaleY(${s})`;
        if(right)right.style.transform=`scaleY(${s})`;
      }
      const loud=Math.max(energy.user,energy.agent);
      if(wrapRef.current)wrapRef.current.dataset.speaker=loud<1.2?'':energy.user>=energy.agent?'user':'agent';
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);

    return ()=>{
      cancelAnimationFrame(raf);
      clearInterval(syncTimer);
      taps.forEach(tap=>tap.source.disconnect());
      ctx.close().catch(()=>{});
      barsRef.current.forEach(b=>{if(b)b.style.transform='';});
      if(wrapRef.current)wrapRef.current.dataset.speaker='';
    };
  },[room,connected]);

  return <div ref={wrapRef} className={`voice-bars ${connected?'live':'idle'}`} aria-hidden="true">
    {Array.from({length:BARS},(_,i)=><span key={i} ref={el=>{barsRef.current[i]=el;}}
      style={{animationDelay:`${(Math.abs(i-(BARS-1)/2)*-0.09).toFixed(2)}s`}}/>)}
  </div>;
}
