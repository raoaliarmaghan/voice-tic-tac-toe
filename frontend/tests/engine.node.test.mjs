// Dependency-free sanity tests. Run: node --test tests/engine.node.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeMove,winnerOf,chooseAgentMove,parsePosition} from '../src/game/engine.js';
test('new board and alternating turns',()=>{
  let g=newGame();assert.equal(g.board.length,9);g=makeMove(g,4,'user').game;
  assert.equal(g.board[4],'X');assert.equal(g.turn,'agent');
});
test('bad indices and turn are rejected',()=>{
  let g=newGame();assert.match(makeMove(g,10,'user').error,/Invalid/);
  g=makeMove(g,0,'user').game;assert.match(makeMove(g,1,'user').error,/turn/);
  assert.match(makeMove(g,0,'agent').error,/taken/);
});
test('win stops game',()=>{
  let g=newGame();for(const [a,i] of [['user',0],['agent',3],['user',1],['agent',4],['user',2]])g=makeMove(g,i,a).game;
  assert.equal(g.status,'user_wins');assert.ok(makeMove(g,5,'agent').error);
});
test('bot completes a line',()=>{
  const g={...newGame(),board:['O','O',null,'X','X',null,null,null,null],turn:'agent'};
  assert.equal(chooseAgentMove(g),2);
});
test('position mapping',()=>{
  assert.equal(parsePosition({row:1,col:1}),4);
  assert.equal(parsePosition({position:9}),8);
  assert.equal(parsePosition({row:3,col:0}),null);
});
