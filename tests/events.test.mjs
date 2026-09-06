import test from 'node:test';
import assert from 'node:assert/strict';
import {EventCursor} from '../web/events.js';
test('event cursor suppresses imported history and plays each live event once',()=>{
 const cursor=new EventCursor(),events=[{id:41},{id:42}];
 assert.deepEqual(cursor.consume(1,events),[]);
 assert.deepEqual(cursor.consume(1,[...events,{id:43}]),[{id:43}]);
 assert.deepEqual(cursor.consume(1,[{id:43}]),[]);
 assert.deepEqual(cursor.consume(2,[{id:1},{id:2}]),[]);
 assert.deepEqual(cursor.consume(2,[{id:2},{id:3}]),[{id:3}]);
 assert.equal(Object.keys(cursor).length,2);
});
