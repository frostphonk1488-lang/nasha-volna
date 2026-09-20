import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}})}

export default async function handler(req){
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const {messages=[],memory=[]}=await req.json();
    const safeMessages=Array.isArray(messages)?messages.slice(-30):[];
    const safeMemory=Array.isArray(memory)?memory.slice(0,30):[];
    const system=[
      "Ты персональный AI-помощник пользователя. Отвечай на русском, естественно и по делу.",
      "Ты не утверждаешь, что являешься копией ChatGPT или сознанием пользователя. Ты AI-помощник на базе OpenAI.",
      "Используй память только как контекст. Не придумывай факты.",
      "Если пользователь явно просит запомнить устойчивую информацию о себе, добавь короткую запись в MEMORY_UPDATE в конце ответа.",
      "Формат MEMORY_UPDATE: одна строка JSON после маркера MEMORY_UPDATE:. Если обновление не нужно, маркер не добавляй."
    ].join("\n");
    const memoryText=safeMemory.length?"\nСохранённая память:\n- "+safeMemory.join("\n- "):"";
    const input=[{role:"system",content:system+memoryText},...safeMessages.map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"")}))];
    const response=await client.responses.create({model:MODEL,input});
    let reply=response.output_text||"";
    let nextMemory=safeMemory;
    const marker="MEMORY_UPDATE:";
    const idx=reply.indexOf(marker);
    if(idx>=0){
      const raw=reply.slice(idx+marker.length).trim();
      reply=reply.slice(0,idx).trim();
      try{const item=JSON.parse(raw); if(item&&item.text) nextMemory=[item.text,...nextMemory.filter(x=>x!==item.text)].slice(0,30)}catch{}
    }
    return json({reply,memory:nextMemory});
  }catch(e){return json({error:e?.message||"AI error"},500)}
}
