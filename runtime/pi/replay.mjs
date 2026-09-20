// Match the pinned native SDK's cached-continuation representation exactly.
import {convertResponsesMessages} from '@earendil-works/pi-ai/api/openai-responses-shared';
export function replayItems(result,modelId) {
 const model={id:modelId,provider:'openai-codex',api:'openai-codex-responses',input:['text','image']};
 return convertResponsesMessages(model,{messages:[result]},new Set(['openai','openai-codex','opencode']),{includeSystemPrompt:false})
  .filter(item=>item.type!=='function_call_output'&&item.type!=='custom_tool_call_output');
}
