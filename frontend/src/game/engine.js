export const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const POSITIONS = ['Top left','Top middle','Top right','Middle left','Center','Middle right','Bottom left','Bottom middle','Bottom right'];
export function newGame(userSymbol='X', firstTurn='user', revision=0) {
  const user = userSymbol === 'O' ? 'O' : 'X';
  return {board:Array(9).fill(null), userSymbol:user, agentSymbol:user==='X'?'O':'X', turn:firstTurn==='agent'?'agent':'user', status:'playing', visible:true, revision, lastMove:null};
}
export const idleGame = () => ({...newGame(), visible:false, status:'idle'});
export function winnerOf(board) {
  for(const line of WIN_LINES) if(board[line[0]] && line.every(i=>board[i]===board[line[0]])) return {winner:board[line[0]], line};
  return {winner:null,line:[]};
}
export function snapshot(g) {return {board:[...g.board], status:g.status, turn:g.turn, moveCount:g.board.filter(Boolean).length,userSymbol:g.userSymbol,agentSymbol:g.agentSymbol,revision:g.revision};}
export function makeMove(g, position, actor) {
  if (!g.visible || g.status!=='playing') return {game:g,error:'Start a new game first.'};
  if (g.turn!==actor) return {game:g,error:`It is ${g.turn}'s turn.`};
  if(!Number.isInteger(position)||position<0||position>8) return {game:g,error:'Invalid square. Choose a position from 1 to 9.'};
  if(g.board[position]!==null) return {game:g,error:`${POSITIONS[position]} is already taken.`};
  const mark=actor==='user'?g.userSymbol:g.agentSymbol;
  const board=[...g.board];board[position]=mark;
  const {winner}=winnerOf(board);
  let status='playing';
  if(winner) status=winner===g.userSymbol?'user_wins':'agent_wins';
  else if(board.every(Boolean)) status='draw';
  const next={...g,board,status,turn:status==='playing'?(actor==='user'?'agent':'user'):null,revision:g.revision+1,lastMove:{position,mark,actor}};
  return {game:next,error:null};
}
export function chooseAgentMove(g) {
  if(g.status!=='playing'||g.turn!=='agent') return null;
  const free=g.board.map((v,i)=>v===null?i:null).filter(x=>x!==null);
  for(const symbol of [g.agentSymbol,g.userSymbol]) {
    for(const i of free) {const board=[...g.board];board[i]=symbol;if(winnerOf(board).winner===symbol)return i;}
  }
  for(const i of [4,0,2,6,8,1,3,5,7]) if(free.includes(i))return i;
  return null;
}
export function parsePosition(raw) {
  if(raw && Number.isInteger(raw.position) && raw.position>=1 && raw.position<=9) return raw.position-1;
  const row=Number(raw?.row), col=Number(raw?.col);
  return Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&row<=2&&col>=0&&col<=2?row*3+col:null;
}
