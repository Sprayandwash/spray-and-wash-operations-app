// Offline stand-in for the Supabase client plus sample data (long names, every status) so layout checks run without a network.
// Fake supabase client + fixtures for offline layout audit (no network, no real data)
(function(){
  const id=(p,n)=>`${p}-${String(n).padStart(4,'0')}-0000-0000-000000000000`;
  const day=(o)=>{const d=new Date(Date.now()+o*864e5);return d.toISOString().slice(0,10);};
  const ts=(o)=>new Date(Date.now()+o*864e5).toISOString();
  const LONG='Christopher Montgomery-Featherstonehaugh the Third';
  const names=['Jamie Benioni',LONG,'Aroha Te Rangi','Sam Li','Brendan Harris','Priya Chandrasekaranathan','Tom Ng','Maria Fernandez-Gonzalez'];
  const F={};
  const U='u-admin';
  F.user_roles=[{id:id('r',1),user_id:U,role:'Admin'}];
  F.profiles=[{user_id:U,email:'admin@example.test',display_name:'Audit Admin',created_at:ts(-90)}].concat(names.map((n,i)=>({user_id:id('u',i+1),email:`person${i+1}@example.test`,display_name:n,created_at:ts(-60),last_seen_at:ts(-i)})));
  F.app_user_access=[{user_id:U,status:'Active',must_change_password:false}];
  F.operations_vehicles=[1,2,3,4].map(i=>({id:id('v',i),rego:['QAN557','ABC123','LONGREGO99','KZP842'][i-1],name:i==2?'Hilux crew cab with very long descriptive vehicle name number two':'Truck '+i,make_model:'Toyota Hilux 2.8 GD-6 SR5 Double Cab 4x4',year:2018+i,status:'Active',assigned_driver:names[i],inspection_frequency_days:7,notes:'',photo_path:'p/x.jpg',photo_file_name:'1782433309123456789012345077.jpg',current_odometer:120000+i,vin_chassis_number:'MR0FB3CD700123456',created_at:ts(-100)}));
  F.operations_washing_equipment=[1,2,3,4,5,6].map(i=>({id:id('w',i),name:'Pressure washer '+i,equipment_type:i%2?'Machinery':'Pump',machinery_type:'Washer',asset_identifier:'WM-'+i,serial_number:'SN'+i*1111,assigned_vehicle_id:id('v',1),mounting_side:i%3?'Driver side':'',status:'Active',has_hour_meter:true,current_engine_hours:100+i,make_model:'Honda GX690',inspection_frequency_days:30,created_at:ts(-80)}));
  F.operations_checklist_templates=[{id:id('t',1),name:'Periodic vehicle check',target_type:'vehicle',frequency_days:7,is_active:true},{id:id('t',2),name:'Washing equipment check',target_type:'washing_equipment',frequency_days:30,is_active:true}];
  F.operations_checklist_items=Array.from({length:12},(_,i)=>({id:id('c',i+1),template_id:id('t',1+i%2),section:'Section '+(i%3+1),question_text:'Is the thing number '+(i+1)+' in good working order and free of damage?',response_type:'pass_fail',required:true,sort_order:i,is_active:true,creates_task_on_problem:true,default_severity:'Medium'}));
  F.operations_inspections=Array.from({length:8},(_,i)=>({id:id('i',i+1),template_id:id('t',1),target_type:'vehicle',vehicle_id:id('v',1+i%4),submitted_by:U,submitted_by_email:'admin@example.test',inspector_name:names[i%8],inspection_date:day(-i*3),odometer:120000+i,overall_result:i%3?'Pass':'Problem',notes:'',created_at:ts(-i*3)}));
  F.operations_maintenance_procedures=[1,2,3].map(i=>({id:id('p',i),name:'Procedure '+i,category:'Service',target_type:'vehicle',description:'d',frequency_days:90,is_active:true}));
  F.operations_maintenance_procedure_steps=[];
  F.operations_equipment_maintenance_schedules=[1,2,3].map(i=>({id:id('s',i),vehicle_id:id('v',i),procedure_id:id('p',i),frequency_days:90,next_due_at:day(i*10-15),is_active:true,last_completed_at:ts(-80)}));
  const st=['Open','In progress','Completed','Deferred','Completed','Completed'];
  F.operations_maintenance_tasks=Array.from({length:24},(_,i)=>({id:id('k',i+1),source_type:i%2?'inspection':'manual',target_type:i%3?'vehicle':'washing_equipment',vehicle_id:id('v',1+i%4),washing_equipment_id:id('w',1+i%6),title:i==3?'Replace the left hand rear tyre and rebalance all four wheels as noted in the inspection':'Task '+(i+1),description:'desc',status:st[i%6],priority:['Low','Medium','High'][i%3],assigned_to:names[i%8],assigned_role:'Maintenance user',due_date:day(i-8),completed_at:st[i%6]=='Completed'?ts(-i):null,created_at:ts(-i*2),target_label:i%3?'QAN557':'Pressure washer 1',source_module:'maintenance'}));
  F.operations_maintenance_task_steps=[];F.operations_maintenance_parts_used=[];F.operations_maintenance_log=[1,2,3].map(i=>({id:id('m',i),record_type:'Service',record_date:day(-i*20),vehicle_id:id('v',i),title:'Service '+i,description:'d',performed_by:'Mechanic',maintenance_done:'Oil change',created_at:ts(-i)}));
  F.operations_maintenance_log_items=[];
  F.operations_asset_files=[{id:id('f',1),target_type:'vehicle',vehicle_id:id('v',1),storage_path:'a/b.pdf',file_name:'Toyota Hilux owners manual and warranty booklet scanned copy final version 2.pdf',file_size_bytes:1200}];
  F.operations_inspection_answers=[];F.operations_inspection_photos=[];
  F.operations_contractors=[
    {id:id('n',1),company_name:'Acme Roofing and Exterior Cleaning Contractors Limited',contractor_type:'Company',contact_name:LONG,contact_phone:'021 123 4567',contact_email:'someone.with.a.long.email.address@acme-roofing-contractors.example.co.nz',active:true,gst_registered:true,trade_type:'Roofing'},
    {id:id('n',2),company_name:'J Smith',contractor_type:'Sole trader',contact_name:'J Smith',contact_phone:'021',contact_email:'j@x.nz',active:true},
    {id:id('n',3),company_name:'Old Co',contractor_type:'Company',contact_name:'Z',active:false}];
  F.operations_preloaded_users=names.slice(0,4).map((n,i)=>({id:id('l',i+1),email:`pre${i}@example.test`,first_name:n.split(' ')[0],last_name:n.split(' ').slice(1).join(' '),display_name:n,role_preset:'Maintenance user',roles:['Maintenance user'],active:true,status:'Pending'}));
  F.operations_training_courses=Array.from({length:8},(_,i)=>({id:id('o',i+1),name:['Working at Heights','First Aid','Site Safe Passport','Confined Space Entry and Rescue Awareness','Forklift','Driver Licence','Chemical handling','Asbestos awareness'][i],category:'Safety',provider:'Provider',sitewise_category:'A',validity_period_months:i%2?24:null,active:true,course_type:i%3?'Course':'Licence',display_order:i}));
  F.operations_training_people=names.map((n,i)=>({id:id('q',i+1),person_type:i%3?'Employee':'Contractor',user_id:id('u',i+1),full_name:n,active:i!=6,competency_level:1,needs_training:true,email:`person${i+1}@example.test`,phone:'021'}));
  F.operations_training_matrix=[];names.forEach((n,i)=>F.operations_training_courses.forEach((c,j)=>F.operations_training_matrix.push({id:id('x',i*10+j),person_id:id('q',i+1),course_id:c.id,applicable:true,compulsory:j%2==0})));
  const rs=['Completed','Completed','Expired','Planned','Completed'];
  F.operations_training_records=[];names.forEach((n,i)=>F.operations_training_courses.slice(0,5).forEach((c,j)=>F.operations_training_records.push({id:id('y',i*10+j),person_id:id('q',i+1),course_id:c.id,status:rs[(i+j)%5],completed_date:day(-100-j*30),expiry_date:day(200-j*150),provider_or_trainer:'Trainer',reference_number:'REF'+j,created_at:ts(-j)})));
  F.operations_training_record_files=F.operations_training_records.slice(0,6).map((r,i)=>({id:id('z',i),record_id:r.id,storage_path:'t/'+i,file_name:'IMG_20261103_102233_certificate_scan_page_1_of_2_long_name.jpg',file_size_bytes:5000,page_order:1}));
  F.operations_training_sessions=[];F.operations_training_sync_sources=[];F.operations_sitewise_categories=[];
  F.equipment=Array.from({length:6},(_,i)=>({id:id('e',i+1),serial:'SER-'+i+'-ABCDEFGHIJKLMNOP',type:['Harness','Lanyard','Rope','Anchor','Helmet','Ladder'][i],manufacturer:'Petzl',model:'Model '+i,date_manufactured:day(-900),inspection_frequency:'6 months',status:['Active','Active','Retired','Active','Under review','Active'][i],archived:false,notes:'',created_at:ts(-50)}));
  F.equipment_photos=[{id:id('h',1),equipment_id:id('e',1),file_path:'e/x.jpg',file_name:'1782433309123456789012345077.jpg',created_at:ts(-3)}];
  F.inspections=Array.from({length:6},(_,i)=>({id:id('g',i+1),equipment_id:id('e',1+i%6),serial:'SER-'+i,equipment_type:'Harness',inspection_date:day(-i*20),inspector:names[i],result:['Pass','Pass','Fail','Pass','Pass','Fail'][i],next_due:day(100-i*40),checklist:[],notes:'',created_at:ts(-i)}));
  F.inspection_photos=[];F.certificates=Array.from({length:3},(_,i)=>({id:id('d',i),certificate_number:'CERT-2026-00'+i,equipment_id:id('e',i+1),inspection_id:id('g',i+1),generated_by_email:'admin@example.test',status:'Issued',created_at:ts(-i)}));
  F.height_inspector_qualifications=[{id:id('j',1),inspector_name:LONG,email:'a@b.nz',qualification_type:'Height Safety Inspector',provider:'Provider',reference_number:'REF',issue_date:day(-300),expiry_date:day(60),file_name:'qualification certificate scan very long name.pdf',storage_path:'q/a',active:true}];
  F.audit_logs=[];F.app_settings=[];F.operations_notification_settings=[{id:1,notifications_enabled:true,timezone:'Pacific/Auckland'}];F.operations_notification_preferences=[];F.operations_notifications=[];F.operations_notification_deliveries=[];F.operations_push_subscriptions=[];F.operations_maintenance_readings=[];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function builder(table){
    let rows=clone(F[table]||[]);let single=false;
    const b={};
    ['select','order','limit','range','in','is','neq','gt','gte','lt','lte','like','ilike','or','not','match','filter','contains','textSearch','csv'].forEach(m=>b[m]=()=>b);
    b.eq=(c,v)=>{if(c==='user_id'||c==='id'||c==='inspector_user_id'){}/* keep all */return b;};
    b.maybeSingle=()=>{single=true;return b;};b.single=()=>{single=true;return b;};
    const out=()=>({data:single?(table==='profiles'?rows[0]:table==='app_user_access'?rows[0]:rows[0]||null):rows,error:null});
    b.then=(res,rej)=>Promise.resolve(out()).then(res,rej);
    ['insert','update','upsert','delete'].forEach(m=>b[m]=()=>({select:()=>({single:()=>Promise.resolve({data:{},error:null}),then:(r)=>Promise.resolve({data:[],error:null}).then(r)}),then:(r,j)=>Promise.resolve({data:null,error:null}).then(r,j),eq:()=>Promise.resolve({data:null,error:null})}));
    return b;}
  const session={access_token:'x',refresh_token:'y',expires_at:9999999999,user:{id:U,email:'admin@example.test'}};
  const client={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),refreshSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null}),signInWithPassword:async()=>({data:{session},error:null})},
    from:builder,rpc:async()=>({data:null,error:null}),
    functions:{invoke:async(n,o)=>({data:{users:[{id:id('u',1),email:'person1@example.test',display_name:LONG,status:'Active',roles:['Maintenance user'],created_at:ts(-40),last_sign_in_at:ts(-1)},{id:id('u',2),email:'person2@example.test',display_name:'Aroha Te Rangi',status:'Blocked',roles:['Employee'],created_at:ts(-40)}],ok:true},error:null})},
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'data:,'},error:null}),upload:async()=>({data:{path:'x'},error:null}),download:async()=>({data:new Blob(['x']),error:null}),remove:async()=>({data:[],error:null})})}};
  window.supabase={createClient:()=>client};
})();
