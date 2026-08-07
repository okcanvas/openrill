import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createOpenAIResponsesAdapter } from "../../packages/model-openai-responses/dist/index.js";

async function collect(iterable){const out=[];for await(const event of iterable)out.push(event);return out;}

test("OpenAI Responses adapter projects requests and parses text, tools, usage, and completion",async()=>{
  let requestBody;let authorization;
  const server=createServer(async(req,res)=>{authorization=req.headers.authorization;requestBody=JSON.parse(await new Promise(resolve=>{let x="";req.setEncoding("utf8");req.on("data",c=>x+=c);req.on("end",()=>resolve(x));}));res.writeHead(200,{"content-type":"text/event-stream"});for(const event of [
    {type:"response.created",response:{id:"resp-1"}},
    {type:"response.output_text.delta",delta:"hello"},
    {type:"response.output_item.added",item:{type:"function_call",call_id:"call-1",name:"echo",arguments:""}},
    {type:"response.function_call_arguments.delta",call_id:"call-1",delta:'{"value":"x"}'},
    {type:"response.output_item.done",item:{type:"function_call",call_id:"call-1",name:"echo",arguments:'{"value":"x"}'}},
    {type:"response.completed",response:{id:"resp-1",usage:{input_tokens:4,output_tokens:2,total_tokens:6}}},
  ])res.write(`data: ${JSON.stringify(event)}\n\n`);res.end();});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{const address=server.address();const adapter=createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${address.port}/v1`,apiKey:"secret"});const events=await collect(adapter.stream({requestId:"r",provider:"default",model:"fixture",systemInstructions:"system",messages:[{role:"user",content:[{type:"text",text:"hi"}]}],tools:[{name:"echo",description:"echo",inputSchema:{type:"object"}}],maxOutputTokens:100}));assert.equal(authorization,"Bearer secret");assert.equal(requestBody.model,"fixture");assert.equal(requestBody.store,false);assert.deepEqual(events.map(e=>e.type),["started","text_delta","tool_call","usage","completed"]);assert.equal(events.find(e=>e.type==="tool_call").argumentsJson,'{"value":"x"}');}
  finally{await new Promise(resolve=>server.close(resolve));}
});
