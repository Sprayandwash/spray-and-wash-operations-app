const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const stub = fs.readFileSync(path.join(__dirname, 'support', 'offline-supabase-stub.js'), 'utf8');

// REG-207: short words, dates and status pills must never split mid-word in any list table.
// Runs the real app against sample data (very long names included); a word is "broken" when its text spans two lines.
function detector(){
  const out=[];
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
  const path=e=>{let p=[];while(e&&e.nodeType==1&&p.length<4){p.unshift(e.tagName.toLowerCase()+(e.className&&typeof e.className=='string'?'.'+e.className.trim().split(/\s+/)[0]:''));e=e.parentElement;}return p.join('>');};
  const root=document.body;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let n;const seen=new Set();
  while(n=walker.nextNode()){
    const el=n.parentElement;if(!el||!vis(el)||/SCRIPT|STYLE|OPTION|TEXTAREA/.test(el.tagName))continue;
    const txt=n.nodeValue;const re=/\S{4,}/g;let m;
    while(m=re.exec(txt)){
      const w=m[0];const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+w.length);
      const rects=[...r.getClientRects()].filter(x=>x.width>0);
      if(rects.length>1){const tops=new Set(rects.map(x=>Math.round(x.top/4)));if(tops.size>1){const key=path(el)+w;if(!seen.has(key)){seen.add(key);out.push({kind:'break',word:w,len:w.length,where:path(el)});}}}
    }
    let a=el,box=null;
    while(a&&a!==document.body){
      const s=getComputedStyle(a);
      const hasBox=(parseFloat(s.borderRightWidth)>0||(s.backgroundColor!=='rgba(0, 0, 0, 0)'&&!/^(TR|TD|TH|BUTTON)$/.test(a.tagName)));
      if(a!==el&&/(auto|scroll|hidden)/.test(s.overflowX)&&!hasBox)break;
      if(a!==el&&hasBox&&!/(auto|scroll|hidden)/.test(s.overflowX)){box=a;break;}
      a=a.parentElement;
    }
    if(box){const rr=document.createRange();rr.selectNodeContents(n);const tr=rr.getBoundingClientRect(),br=box.getBoundingClientRect();
      if(tr.width>0&&tr.right>br.right+1){const key='o'+path(el)+txt.slice(0,20);if(!seen.has(key)){seen.add(key);out.push({kind:'outside',word:txt.trim().slice(0,50),over:Math.round(tr.right-br.right),where:path(el)+' in '+path(box)});}}}
  }
  if(document.documentElement.scrollWidth>innerWidth+1)out.push({kind:'pagescroll',over:document.documentElement.scrollWidth-innerWidth});
  return out;
}


const SCREENS = [
  { module: 'Maintenance', tab: 'Tasks', openCompleted: true },
  { module: 'Training', tab: 'Register' },
  { module: 'Training', tab: 'Contractors' },
  { module: 'Training', tab: 'Team members' },
  { module: 'Admin', tab: 'Users & Permissions' },
  { module: 'Height Equipment', tab: 'Qualifications' }
];

test.describe('REG-207: list tables keep short words whole', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop width only');
    await page.route('**/@supabase/supabase-js**', route => route.fulfill({ contentType: 'application/javascript', body: stub }));
    await page.goto('/');
    await page.waitForFunction(() => window.SWOperationsV4 && window.SWOperationsV4.state.roles && window.SWOperationsV4.state.roles.length && window.SWOperationsV4.state.tasks.length && window.SWOperationsV4.state.vehicles.length);
    await page.waitForTimeout(1500); // let the first data load finish; it returns to Home when done
  });

  for (const s of SCREENS) {
    test(`${s.module} > ${s.tab}`, async ({ page }) => {
      await page.locator('button', { hasText: new RegExp('^' + s.module + '$') }).first().click();
      await expect(page.locator('button', { hasText: new RegExp('^' + s.tab + '$') }).first()).toBeVisible();
      await page.locator('button', { hasText: new RegExp('^' + s.tab + '$') }).first().click();
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await page.waitForTimeout(200);
      expect(await page.locator('#opsShell tbody tr, #opsShell table tr').count(), 'the table has rows').toBeGreaterThan(2);
      const found = await page.evaluate(detector);
      const bad = found.filter(f => f.kind === 'break' && !/-/.test(f.word) && f.word.length <= 24);
      expect(bad, JSON.stringify(bad.slice(0, 8))).toEqual([]);
    });
  }
});
