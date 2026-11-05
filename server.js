'use strict';
require('dotenv').config();
const express=require('express');
const {Pool}=require('pg');
const crypto=require('node:crypto');
const path=require('node:path');
const app=express();
const {DATABASE_URL,ADMIN_PASSWORD,SESSION_SECRET}=process.env;
if(!DATABASE_URL||!ADMIN_PASSWORD||!SESSION_SECRET||SESSION_SECRET.length<32){console.error('DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET(32자 이상)를 설정하세요.');process.exit(1)}
const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
app.disable('x-powered-by');app.set('trust proxy',process.env.TRUST_PROXY==='true'?1:false);
app.use(express.json({limit:'3mb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");next()});
const hash=v=>crypto.createHmac('sha256',SESSION_SECRET).update(v).digest('hex');
const cookieName='charil_admin';
function getToken(req){const m=(req.headers.cookie||'').match(/(?:^|;\s*)charil_admin=([^;]+)/);return m?decodeURIComponent(m[1]):null}
async function authorized(req){const token=getToken(req);if(!token||!/^[a-f0-9]{64}$/.test(token))return false;const {rows}=await pool.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>NOW()',[hash(token)]);return rows.length>0}
async function requireAdmin(req,res,next){try{if(!await authorized(req))return res.status(401).json({error:'관리자 로그인이 필요합니다.'});next()}catch(e){next(e)}}
function sameOrigin(req,res,next){const origin=req.get('origin');if(origin){try{const host=new URL(origin).host;if(host!==req.get('host'))return res.status(403).json({error:'허용되지 않은 요청입니다.'})}catch{return res.status(403).json({error:'허용되지 않은 요청입니다.'})}}next()}
app.use('/api', (req,res,next)=>['POST','PUT','PATCH','DELETE'].includes(req.method)?sameOrigin(req,res,next):next());
let failures=new Map();
app.post('/api/login',async(req,res,next)=>{try{
 const ip=req.ip;const entry=failures.get(ip)||{count:0,until:0};if(entry.until>Date.now())return res.status(429).json({error:'로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.'});
 const provided=String(req.body?.password||'');const a=crypto.scryptSync(provided,SESSION_SECRET,64),b=crypto.scryptSync(ADMIN_PASSWORD,SESSION_SECRET,64);
 if(!crypto.timingSafeEqual(a,b)){entry.count++;if(entry.count>=8){entry.count=0;entry.until=Date.now()+15*60*1000}failures.set(ip,entry);return res.status(401).json({error:'비밀번호가 올바르지 않습니다.'})}
 failures.delete(ip);const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,expires_at) VALUES($1,NOW()+INTERVAL '7 days')",[hash(token)]);
 res.cookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:7*86400000});res.json({ok:true});
 }catch(e){next(e)}});
app.get('/api/session',async(req,res,next)=>{try{res.json({admin:await authorized(req)})}catch(e){next(e)}});
app.post('/api/logout',requireAdmin,async(req,res,next)=>{try{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(getToken(req))]);res.clearCookie(cookieName,{path:'/'});res.json({ok:true})}catch(e){next(e)}});
app.get('/api/public',async(req,res,next)=>{try{const [records,settings]=await Promise.all([pool.query('SELECT id,name,viewer_id AS "viewerId",description AS "desc",count,status,created_at::date::text AS date FROM roulette_items ORDER BY created_at DESC,id DESC'),pool.query('SELECT key,value FROM site_settings')]);const obj={banner:null,viewerIcon:null};for(const r of settings.rows)obj[r.key]=r.value;res.set('Cache-Control','no-store').json({items:records.rows,settings:obj})}catch(e){next(e)}});
function validateItem(body){const name=String(body.name||'').trim(),viewerId=String(body.viewerId||'').trim(),desc=String(body.desc||'').trim(),count=Number(body.count);if(!name||name.length>100||viewerId.length>100||desc.length>10000||!Number.isSafeInteger(count)||count<0||count>999999)return null;return{name,viewerId,desc,count}}
app.post('/api/items',requireAdmin,async(req,res,next)=>{try{const x=validateItem(req.body||{});if(!x)return res.status(400).json({error:'입력값을 확인해 주세요.'});const r=await pool.query('INSERT INTO roulette_items(name,viewer_id,description,count) VALUES($1,$2,$3,$4) RETURNING id',[x.name,x.viewerId,x.desc,x.count]);res.status(201).json({id:r.rows[0].id})}catch(e){next(e)}});
app.put('/api/items/:id',requireAdmin,async(req,res,next)=>{try{const x=validateItem(req.body||{});if(!x)return res.status(400).json({error:'입력값을 확인해 주세요.'});const r=await pool.query('UPDATE roulette_items SET name=$1,viewer_id=$2,description=$3,count=$4 WHERE id=$5 RETURNING id',[x.name,x.viewerId,x.desc,x.count,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'기록을 찾을 수 없습니다.'});res.json({ok:true})}catch(e){next(e)}});
app.delete('/api/items/:id',requireAdmin,async(req,res,next)=>{try{const r=await pool.query('DELETE FROM roulette_items WHERE id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'기록을 찾을 수 없습니다.'});res.json({ok:true})}catch(e){next(e)}});
app.put('/api/settings/:key',requireAdmin,async(req,res,next)=>{try{const key=req.params.key;if(!['banner','viewerIcon'].includes(key))return res.status(404).json({error:'설정을 찾을 수 없습니다.'});const v=req.body?.value;if(v!==null&&(typeof v!=='string'||v.length>2400000||!/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(v)))return res.status(400).json({error:'이미지 형식이 올바르지 않습니다.'});if(v===null)await pool.query('DELETE FROM site_settings WHERE key=$1',[key]);else await pool.query('INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,v]);res.json({ok:true})}catch(e){next(e)}});
app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1');res.status(200).json({ok:true})}catch(e){res.status(503).json({ok:false})}});
app.use(express.static(path.join(__dirname,'public'),{index:'index.html'}));
app.use((err,req,res,next)=>{console.error(err);res.status(err.type==='entity.too.large'?413:500).json({error:'서버 처리 중 오류가 발생했습니다.'})});
async function main(){await pool.query(`CREATE TABLE IF NOT EXISTS roulette_items (id BIGSERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,viewer_id VARCHAR(100) NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',count INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT '진행중',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,expires_at TIMESTAMPTZ NOT NULL);`);await pool.query('DELETE FROM sessions WHERE expires_at<NOW()');app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Server ready on port '+(process.env.PORT||3000)))}
main().catch(e=>{console.error('Database initialization failed:',e);process.exit(1)});
