import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
export const TZ='Pacific/Auckland';
export const db=()=>createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
export const mins=(v:unknown)=>{const [h,m]=String(v||'00:00').split(':').map(Number);return h*60+m};
export function nz(d=new Date()){const x=Object.fromEntries(new Intl.DateTimeFormat('en-NZ',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));const wd:Record<string,number>={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};return{date:`${x.year}-${x.month}-${x.day}`,day:wd[String(x.weekday)]||1,minutes:Number(x.hour)*60+Number(x.minute)}}
export const near=(t:unknown,w=15)=>{const p=nz(),q=mins(t);return p.minutes>=q&&p.minutes<q+w};
export const addDays=(d:string,n:number)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
export async function settings(c:any){const {data,error}=await c.from('operations_notification_settings').select('*').eq('id',1).single();if(error)throw error;return data}
export async function authorized(c:any,req:Request,kind:'push'|'weekly'){const header=kind==='push'?'x-spray-wash-task-push-secret':'x-spray-wash-scheduler-secret';const {data,error}=await c.rpc('verify_notification_scheduler_secret',{secret_kind:kind,supplied_secret:req.headers.get(header)||''});if(error)throw error;return data===true}
export async function markRun(c:any,status:string,detail:unknown){await c.from('operations_notification_settings').update({last_scheduler_run_at:new Date().toISOString(),last_scheduler_status:status,last_scheduler_detail:detail}).eq('id',1)}
export const escapeHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));