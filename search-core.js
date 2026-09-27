(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NVSearch=api;})(globalThis,()=>{
const groups=[['tasks','Задачи','tasks'],['projects','Проекты','projects'],['memories','Память','memory'],['clients','Клиенты','clients'],['docs','Документы','docs']];
function search(data,query){const words=query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);if(!words.length)return [];const found=[];for(const [key,page,icon] of groups)for(const row of data[key]||[]){const title=row.title||row.name||row.text||'';const detail=[row.desc,row.text,row.contact,row.status].filter(Boolean).join(' ');const hay=(title+' '+detail).toLocaleLowerCase('ru');if(words.every(w=>hay.includes(w)))found.push({id:row.id,page,icon,title,detail:detail.slice(0,180)});}return found.slice(0,100);}
return {search};
});
