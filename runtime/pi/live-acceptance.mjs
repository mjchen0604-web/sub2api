import {modelAcceptance} from '../../tools/pi-integration/acceptance.mjs';

// Keep independent claims independent: a model mismatch must not erase a
// successful tool/transport check, and SSE fallback cannot prove WS reuse.
export function liveAcceptance(result, {model, transport, turn, expectedModels}) {
 const modelResult=modelAcceptance(new Set(result.evidence.observedModels),model,expectedModels);
 const outboundPassed=result.outbound?.modelMatchesRequest===true;
 const protocolPassed=result.evidence.terminal_status==='completed' &&
  !['error','aborted'].includes(result.result.stopReason);
 let transportPassed=['sse','websocket'].includes(result.transport);
 if(transport==='sse')transportPassed=result.transport==='sse';
 if(transport==='websocket'||transport==='websocket-cached') {
  transportPassed=result.transport==='websocket' && result.evidence.stream_interrupted===false &&
   result.continuation?.sseFallbacks===0;
 }
 if(transport==='websocket-cached'&&turn===2) {
  transportPassed=transportPassed && result.outbound?.previousResponseIDPresent===true &&
   result.continuation?.connectionsCreated===1 && result.continuation?.connectionsReused>=1 &&
   result.continuation?.deltaRequests>=1 && result.continuation?.fullContextRequests===1;
 }
 return {modelAcceptance:modelResult,outboundPassed,protocolPassed,transportPassed,
  passed:protocolPassed&&outboundPassed&&transportPassed&&modelResult.passed};
}
