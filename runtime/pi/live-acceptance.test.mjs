import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveAcceptance} from './live-acceptance.mjs';
const options={model:'gpt-6-astra',transport:'websocket-cached',turn:2};
function result(){return {
 evidence:{terminal_status:'completed',stream_interrupted:false,observedModels:['gpt-6-astra']},
 result:{stopReason:'stop'},transport:'websocket',
 outbound:{modelMatchesRequest:true,previousResponseIDPresent:true},
 continuation:{connectionsCreated:1,connectionsReused:1,deltaRequests:1,fullContextRequests:1,sseFallbacks:0}
}}
test('WS acceptance requires actual reuse and delta, not just successful text',()=>{
 assert.equal(liveAcceptance(result(),options).passed,true);
 for(const change of [
  r=>r.transport='sse',r=>r.continuation.sseFallbacks=1,
  r=>r.continuation.connectionsReused=0,r=>r.continuation.connectionsCreated=2,
  r=>r.continuation.deltaRequests=0,r=>r.continuation.fullContextRequests=2,
  r=>r.outbound.previousResponseIDPresent=false,r=>r.evidence.stream_interrupted=true,
  r=>delete r.continuation,
 ]){const r=result();change(r);assert.equal(liveAcceptance(r,options).transportPassed,false)}
});
test('model, outbound, protocol, and transport failures remain independent',()=>{
 const wrong=result();wrong.evidence.observedModels=['gpt-5.6-luna'];
 const a=liveAcceptance(wrong,options);
 assert.equal(a.modelAcceptance.passed,false);assert.equal(a.protocolPassed,true);
 assert.equal(a.transportPassed,true);assert.equal(a.passed,false);
 const changed=result();changed.outbound.modelMatchesRequest=false;
 assert.equal(liveAcceptance(changed,options).passed,false);
 const failed=result();failed.evidence.terminal_status='conflict';
 assert.equal(liveAcceptance(failed,options).protocolPassed,false);
});
test('SSE semantic completion permits the native SDK terminal cancellation',()=>{
 const r=result();r.transport='sse';r.evidence.stream_interrupted=true;r.continuation=null;
 assert.equal(liveAcceptance(r,{...options,transport:'sse'}).passed,true);
});
