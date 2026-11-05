const BASE = 'https://api3.adsterratools.com/publisher';
const HOST = new URL(BASE).hostname;
const TIMEOUT_MS = 30000;

function validUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function extractSmartlinks(payload) {
  const records = [];
  const seen = new Set();
  const collectionKeys = new Set(['smartlinks','smart_links','smart-links','links','data','items','results','result','records','placements']);
  const urlKeys = ['url','link','smartlink','smart_link','smartlink_url','smart_link_url','link_url','direct_url','direct_link','target_url','destination_url','destination'];
  function collect(node, depth = 0) {
    if (depth > 7 || node == null) return;
    if (typeof node === 'string') { if (validUrl(node)) records.push({url:node.trim(),name:'',id:null,status:'Active'}); return; }
    if (Array.isArray(node)) { for (const x of node) collect(x, depth + 1); return; }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    let raw = null;
    for (const k of urlKeys) if (typeof node[k] === 'string' && validUrl(node[k])) { raw = node[k].trim(); break; }
    if (raw) {
      records.push({url:raw,name:String(node.name || node.title || node.label || node.domain || '').slice(0,200),id:node.id || node.smartlink_id || null,status:node.status || 'Active'});
      return;
    }
    for (const [k,v] of Object.entries(node)) if (collectionKeys.has(k.toLowerCase())) collect(v, depth + 1);
  }
  collect(payload);
  const unique = new Map();
  for (const item of records) { const key = item.url.replace(/\/$/, ''); if (!unique.has(key)) unique.set(key,item); }
  return [...unique.values()];
}

async function requestJson(resource, token, query = '') {
  const url = `${BASE}/${resource}${query}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {headers:{'X-API-Key':token,'Accept':'application/json'}, signal:controller.signal, redirect:'error'});
    const body = await resp.text();
    let data = null; try { data = JSON.parse(body); } catch {}
    return {resp, data, body};
  } finally { clearTimeout(timer); }
}

async function fetchSmartlinks(token) {
  token = String(token || '').trim();
  if (!token) return {ok:false,error:'ADSTERRA_API_TOKEN is not configured.'};
  const errors = [];
  for (const resource of ['smart-links.json','smartlinks.json','placements.json']) {
    try {
      const {resp,data} = await requestJson(resource, token);
      if (resp.status === 401 || resp.status === 403) return {ok:false,error:`Unauthorized (HTTP ${resp.status})`};
      if (resp.status === 429) return {ok:false,error:'Adsterra API rate limit reached.'};
      if (!resp.ok) { errors.push(`${resource}: HTTP ${resp.status}`); continue; }
      const links = extractSmartlinks(data);
      if (links.length) return {ok:true,links,endpoint:resource};
      errors.push(`${resource}: no SmartLinks found`);
    } catch (e) { errors.push(`${resource}: ${e.message}`); }
  }
  return {ok:false,error:`No SmartLinks returned. ${errors.join(' | ')}`};
}

async function fetchPublisherReport(token, startDate, finishDate) {
  token = String(token || '').trim();
  if (!token) return {ok:false,error:'ADSTERRA_API_TOKEN is not configured.'};
  const start = startDate || new Date().toISOString().slice(0,10);
  const finish = finishDate || start;
  const qs = new URLSearchParams({start_date:start,finish_date:finish,group_by:'date'});
  try {
    const {resp,data} = await requestJson(`stats.json`, token, `?${qs.toString()}`);
    if (!resp.ok) return {ok:false,error:`Adsterra HTTP ${resp.status}`};
    return {ok:true,start_date:start,finish_date:finish,data};
  } catch (e) { return {ok:false,error:e.message}; }
}

export { HOST, fetchSmartlinks, fetchPublisherReport };
