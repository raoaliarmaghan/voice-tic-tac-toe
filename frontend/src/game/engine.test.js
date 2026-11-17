import {describe,it,expect} from 'vitest';
import {newGame,idleGame,makeMove,chooseAgentMove,parsePosition,snapshot,winnerOf} from './engine';
describe('tic tac toe game engine',()=>{
 it('starts with a fresh board',()=>{const g=newGame();expect(g.board).toHaveLength(9);expect(g.turn).toBe('user');expect(g.userSymbol).toBe('X')});
 it('accepts legal moves and alternates',()=>{const a=makeMove(newGame(),4,'user');expect(a.error).toBeNull();expect(a.game.board[4]).toBe('X');expect(a.game.turn).toBe('agent');expect(a.game.revision).toBe(1)});
 it('rejects occupied and wrong turn',()=>{let g=makeMove(newGame(),4,'user').game;expect(makeMove(g,4,'agent').error).toMatch(/taken/);expect(makeMove(g,0,'user').error).toMatch(/turn/)});
 it('rejects invalid index and idle state',()=>{expect(makeMove(newGame(),9,'user').error).toMatch(/Invalid/);expect(makeMove(idleGame(),0,'user').error).toMatch(/Start/)});
 it('recognizes user victory and prevents later moves',()=>{let g=newGame();for(const [who,p] of [['user',0],['agent',3],['user',1],['agent',4],['user',2]])g=makeMove(g,p,who).game;expect(g.status).toBe('user_wins');expect(makeMove(g,6,'agent').error).toBeTruthy()});
 it('recognizes a draw',()=>{let g=newGame();for(const [who,p] of [['user',0],['agent',1],['user',2],['agent',4],['user',3],['agent',5],['user',7],['agent',6],['user',8]])g=makeMove(g,p,who).game;expect(g.status).toBe('draw')});
 it('picks a win before blocking',()=>{let g={...newGame(),turn:'agent',board:['O','O',null,'X','X',null,null,null,null]};expect(chooseAgentMove(g)).toBe(2)});
 it('blocks opponents win',()=>{let g={...newGame(),turn:'agent',board:['X','X',null,null,'O',null,null,null,null]};expect(chooseAgentMove(g)).toBe(2)});
 it('parses zero-based coordinates',()=>{expect(parsePosition({row:1,col:1})).toBe(4);expect(parsePosition({row:3,col:0})).toBeNull();expect(parsePosition({position:1})).toBe(0)});
 it('copies board in snapshots',()=>{const g=newGame();const s=snapshot(g);s.board[0]='X';expect(g.board[0]).toBeNull()});
 it('finds winning diagonal',()=>{expect(winnerOf(['X',null,null,null,'X',null,null,null,'X']).winner).toBe('X')});
});
