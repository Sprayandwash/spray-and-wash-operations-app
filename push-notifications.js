// Employee enrolment plus Admin notification policy controls. No provider send is initiated from this browser file.
(() => {
  const EMPLOYEE_FUNCTION = 'employee-notifications';
  const ADMIN_FUNCTION = 'notification-control';
  let latestStatus = null;
  let latestAdminStatus = null;

  const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shortTime = value => String(value || '').slice(0,5);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayName = value => days[Number(value || 1) - 1] || 'Mon';
  const base64UrlToUint8Array = value => {
    const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  };

  async function invoke(name, action, payload = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in again to manage notifications.');
    const { data, error } = await sb.functions.invoke(name, { headers:{ Authorization:`Bearer ${session.access_token}` }, body:{ action, ...payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }
  const employeeCall = (action,payload={}) => invoke(EMPLOYEE_FUNCTION,action,payload);
  const adminCall = (action,payload={}) => invoke(ADMIN_FUNCTION,action,payload);
  const setPanel = html => { const panel=document.getElementById('pushNotificationSettings'); if(panel) panel.innerHTML=html; };

  function renderEmployee(){
    if (!currentUser) return setPanel('<h3>Job reminders</h3><p class="muted">Sign in to manage reminders and weekly email.</p>');
    if (!latestStatus) return setPanel('<h3>Job reminders</h3><p class="muted">Checking notification availability…</p>');
    const weeklyEnabled = latestStatus.weekly_email_enabled === true;
    const weeklyControl = `<div class="pushSettings"><h3>Weekly task email</h3><p class="muted">${weeklyEnabled?'Enabled for your own open-task summary.':'Optional. Receive only your own open tasks when weekly employee email is allowed by Admin.'}</p><div class="row"><button class="primary" onclick="setWeeklyEmailPreference(true)" ${weeklyEnabled?'disabled':''}>Enable weekly task email</button>${weeklyEnabled?'<button onclick="setWeeklyEmailPreference(false)">Disable</button>':''}</div></div>`;
    if (!supported()) return setPanel(`<h3>Job reminders</h3><p class="muted">Push reminders need the installed Spray &amp; Wash app on a supported Android browser.</p>${weeklyControl}`);
    if (!latestStatus.vapid_public_key) return setPanel(`<h3>Job reminders</h3><p class="muted">Push reminders are being prepared and cannot be enabled yet.</p>${weeklyControl}`);
    if (Notification.permission === 'denied') return setPanel(`<h3>Job reminders</h3><p class="dangerBox">Notifications are blocked for this app. Enable them in browser or Android settings, then return here.</p>${weeklyControl}`);
    const active = latestStatus.push_enabled && latestStatus.subscriptions?.length;
    const detail = active ? `Enabled on ${latestStatus.subscriptions.length} device${latestStatus.subscriptions.length===1?'':'s'}.` : 'Enable reminders for new assignments and due items.';
    const canTest = window.SPRAY_WASH_ENV === 'staging' && latestStatus.is_admin && latestStatus.is_staging_test_delivery_enabled && active && latestStatus.subscriptions.length === 1;
    setPanel(`<h3>Job reminders</h3><p class="muted">${esc(detail)}</p><div class="row"><button class="primary" onclick="enablePushNotifications()" ${active?'disabled':''}>Enable phone reminders</button>${active?'<button onclick="disablePushNotifications()">Disable</button>':''}${canTest?'<button class="primary" onclick="sendStagingTestPush()">Send one staging test push</button>':''}</div>${weeklyControl}`);
  }

  async function refresh(){ latestStatus=null; renderEmployee(); if(!currentUser)return; try{latestStatus=await employeeCall('status');}catch(e){console.warn('Notification status unavailable',e);return setPanel('<h3>Job reminders</h3><p class="muted">Reminder settings are temporarily unavailable.</p>');} renderEmployee(); }

  window.enablePushNotifications = async () => { if(!supported()||!latestStatus?.vapid_public_key)return renderEmployee(); try{const permission=await Notification.requestPermission();if(permission!=='granted')return renderEmployee();const registration=await navigator.serviceWorker.ready;let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToUint8Array(latestStatus.vapid_public_key)});await employeeCall('register_push_subscription',{subscription:subscription.toJSON(),device_label:'Android PWA'});await refresh();}catch(e){alert(`Could not enable phone reminders: ${e.message||'Please try again.'}`);await refresh();} };
  window.disablePushNotifications = async () => { try{const registration=await navigator.serviceWorker.ready;const subscription=await registration.pushManager.getSubscription();if(subscription)await subscription.unsubscribe();await employeeCall('disable_push');}catch(e){alert(`Could not disable phone reminders: ${e.message||'Please try again.'}`);}await refresh(); };
  window.setWeeklyEmailPreference = async enabled => { try{await employeeCall('set_weekly_email_preference',{enabled:enabled===true});}catch(e){alert(`Could not update weekly task email: ${e.message||'Please try again.'}`);}await refresh(); };
  window.sendStagingTestPush = async () => { if(!(window.SPRAY_WASH_ENV==='staging'&&latestStatus?.is_admin&&latestStatus?.is_staging_test_delivery_enabled))return;if(!confirm('Send one staging test notification to this enrolled phone?'))return;try{await employeeCall('send_staging_test_push',{confirmation:'SEND_ONE_STAGING_TEST_PUSH'});alert('The staging test push was accepted.');}catch(e){alert('Could not send the staging test: '+(e.message||'Please try again.'));}await refresh(); };

  function checkbox(id,label,checked){return `<label class="ops-permission-check"><input type="checkbox" id="${id}" ${checked?'checked':''}> <span><strong>${esc(label)}</strong></span></label>`;}
  function timeInput(id,label,value){return `<label>${esc(label)}<input id="${id}" type="time" value="${esc(shortTime(value))}"></label>`;}
  function selectDay(id,label,value){return `<label>${esc(label)}<select id="${id}">${days.map((d,i)=>`<option value="${i+1}" ${Number(value)===i+1?'selected':''}>${d}</option>`).join('')}</select></label>`;}
  function renderAdminCard(){
    const host=document.getElementById('opsAppSettingsForm')?.closest('.ops-card');
    if(!host||document.getElementById('opsNotificationAdminCard'))return;
    const card=document.createElement('div'); card.id='opsNotificationAdminCard'; card.className='ops-card'; card.innerHTML='<h3>Notifications</h3><p class="ops-subtle">Loading notification controls…</p>'; host.insertAdjacentElement('afterend',card);
    loadAdminCard();
  }
  async function loadAdminCard(){
    const card=document.getElementById('opsNotificationAdminCard');if(!card)return;
    try{latestAdminStatus=await adminCall('admin_notification_status');}catch(e){card.innerHTML=`<h3>Notifications</h3><p class="dangerBox">Notification controls are unavailable: ${esc(e.message||'Unknown error')}</p>`;return;}
    const s=latestAdminStatus.settings||{}; const backend=latestAdminStatus.backend||{}; const enrolled=latestAdminStatus.enrolment||{};
    card.innerHTML=`<div class="ops-section-title"><div><h3>Notifications</h3><p class="ops-subtle">Operational settings in Pacific/Auckland. Backend delivery switches remain an independent emergency kill switch.</p></div><span class="ops-pill ${s.notifications_enabled?'ops-ok':'ops-warn'}">${s.notifications_enabled?'Master ON':'Master OFF'}</span></div>
    <form id="opsNotificationAdminForm" class="ops-form">
      <div class="ops-span-2"><strong>Master controls</strong><div class="ops-permission-grid">${checkbox('opsNotifyMaster','Automatic notifications',s.notifications_enabled)}${checkbox('opsNotifyPush','Task push notifications',s.task_push_enabled)}</div></div>
      <div class="ops-span-2"><strong>New task assigned</strong><div class="ops-permission-grid">${checkbox('opsNotifyAssignment','Send assignment push',s.assignment_push_enabled)}</div></div>
      <label>Assignment delay (minutes)<input id="opsNotifyAssignmentDelay" type="number" min="0" max="1440" step="1" value="${Number(s.assignment_delay_minutes||0)}"></label>
      <div></div>
      <div class="ops-span-2"><strong>Due soon</strong><div class="ops-permission-grid">${checkbox('opsNotifyDueSoon','Due-soon push',s.due_soon_enabled)}</div></div>
      <label>How long before due (hours)<input id="opsNotifyDueHours" type="number" min="1" max="720" step="1" value="${Number(s.due_soon_hours_before||48)}"></label>${timeInput('opsNotifyDueTime','Due-soon send time',s.due_soon_send_time)}
      <div class="ops-span-2"><strong>Overdue</strong><div class="ops-permission-grid">${checkbox('opsNotifyOverdue','Overdue push',s.overdue_enabled)}</div></div>
      <label>Repeat every (days)<input id="opsNotifyOverdueRepeat" type="number" min="1" max="30" step="1" value="${Number(s.overdue_repeat_days||1)}"></label>${timeInput('opsNotifyOverdueTime','Overdue send time',s.overdue_send_time)}
      <div class="ops-span-2"><strong>Push delivery window</strong></div>${timeInput('opsNotifyPushStart','Start',s.push_start_time)}${timeInput('opsNotifyPushEnd','End',s.push_end_time)}
      <div class="ops-span-2"><div class="ops-permission-grid">${days.map((d,i)=>checkbox('opsNotifyDay'+(i+1),d,(s.push_days||[]).includes(i+1))).join('')}</div></div>
      <div class="ops-span-2"><strong>Admin weekly email</strong><div class="ops-permission-grid">${checkbox('opsNotifyAdminWeekly','Admin weekly email',s.admin_weekly_email_enabled)}</div></div>${selectDay('opsNotifyAdminDay','Day',s.admin_weekly_day)}${timeInput('opsNotifyAdminTime','Time',s.admin_weekly_time)}
      <div class="ops-span-2"><strong>Employee weekly email</strong><div class="ops-permission-grid">${checkbox('opsNotifyEmployeeWeekly','Allow employee opt-in',s.employee_weekly_email_allowed)}</div></div>${selectDay('opsNotifyEmployeeDay','Day',s.employee_weekly_day)}${timeInput('opsNotifyEmployeeTime','Time',s.employee_weekly_time)}
      <div class="ops-span-2 securityBox"><strong>System status</strong><p>Push-enabled users: ${Number(enrolled.push_enabled_users||0)} · Granted devices: ${Number(enrolled.granted_devices||0)} · Recent delivery failures: ${Number(latestAdminStatus.recent_failures||0)}</p><p>Push backend: ${backend.task_push_delivery_enabled?'enabled':'disabled'} · Weekly email backend: ${backend.weekly_delivery_enabled?'enabled':'disabled'} · Last scheduler run: ${esc(s.last_scheduler_run_at||'Not yet')}</p></div>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save notification settings</button></div>
    </form>`;
    document.getElementById('opsNotificationAdminForm')?.addEventListener('submit',saveAdminNotifications);
  }
  async function saveAdminNotifications(event){
    event.preventDefault(); const ids=n=>document.getElementById(n); const payload={
      notifications_enabled:ids('opsNotifyMaster').checked,task_push_enabled:ids('opsNotifyPush').checked,assignment_push_enabled:ids('opsNotifyAssignment').checked,assignment_delay_minutes:Number(ids('opsNotifyAssignmentDelay').value),due_soon_enabled:ids('opsNotifyDueSoon').checked,due_soon_hours_before:Number(ids('opsNotifyDueHours').value),due_soon_send_time:ids('opsNotifyDueTime').value,overdue_enabled:ids('opsNotifyOverdue').checked,overdue_repeat_days:Number(ids('opsNotifyOverdueRepeat').value),overdue_send_time:ids('opsNotifyOverdueTime').value,push_start_time:ids('opsNotifyPushStart').value,push_end_time:ids('opsNotifyPushEnd').value,push_days:days.map((_,i)=>i+1).filter(i=>ids('opsNotifyDay'+i).checked),admin_weekly_email_enabled:ids('opsNotifyAdminWeekly').checked,admin_weekly_day:Number(ids('opsNotifyAdminDay').value),admin_weekly_time:ids('opsNotifyAdminTime').value,employee_weekly_email_allowed:ids('opsNotifyEmployeeWeekly').checked,employee_weekly_day:Number(ids('opsNotifyEmployeeDay').value),employee_weekly_time:ids('opsNotifyEmployeeTime').value
    };
    try{await adminCall('update_admin_notification_settings',payload);alert('Notification settings saved.');document.getElementById('opsNotificationAdminCard').remove();renderAdminCard();}catch(e){alert('Notification settings were not saved: '+(e.message||'Unknown error'));}
  }

  const observer=new MutationObserver(()=>renderAdminCard()); observer.observe(document.documentElement,{childList:true,subtree:true});
  window.refreshPushNotificationSettings=refresh;
})();
