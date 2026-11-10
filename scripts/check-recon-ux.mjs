import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const { _electron }=await import(process.env.TRACE_PLAYWRIGHT_MODULE || 'playwright');
const axePath=process.env.TRACE_AXE_PATH || require.resolve('axe-core/axe.min.js');
const root=path.resolve(process.env.TRACE_UX_OUTPUT || path.join(repo,'artifacts/recon-ux'));
mkdirSync(path.join(root,'attachments'),{recursive:true});
const profile=root+'/cases/'+Date.now();
const env={...process.env,TRACE_WORKSPACE_PATH:profile+'/workspace',TRACE_USER_DATA_DIR:profile+'/profile'};delete env.ELECTRON_RUN_AS_NODE;
const {Client}=await import(repo+'/node_modules/@modelcontextprotocol/client/dist/index.mjs');
const {StdioClientTransport}=await import(repo+'/node_modules/@modelcontextprotocol/client/dist/stdio.mjs');
const app=await _electron.launch({executablePath:require('electron'),args:[repo],env,timeout:60000});
const report={recordedAt:new Date().toISOString(),profile,checks:[],scans:[],layouts:[],errors:[],collectionData:'Explicit synthetic runner fixture; production IPC used for settings, real local health and assistant proposals.'};
const check=(value,message)=>{if(!value)throw Error(message);report.checks.push(message);console.log(message);};
try {
const page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(1000);
const caseId=await page.evaluate(async()=>{const api=window.electronAPI;const project=await api.createProject('UX review · domain evidence','Synthetic records for interface verification only.');const ws=await api.getWorkspace();await api.saveWorkspace({...ws,activeProjectId:project.id});return project.id;});report.caseId=caseId;
await page.reload();await page.getByRole('button',{name:'Recon & MCP',exact:true}).click();const d=page.getByRole('dialog',{name:'Recon & MCP'});await d.getByRole('heading',{name:'Runner connection'}).waitFor();
check(await d.getByRole('button',{name:'Connection',exact:true}).getAttribute('aria-pressed')==='true','First use opens connection setup');
await d.getByLabel('Allowed root domains, one per line').fill('https://example.com');await d.getByRole('button',{name:'Save connection',exact:true}).click();await d.getByRole('alert').filter({hasText:'hostname'}).waitFor();report.checks.push('Invalid scope gives readable error');
await d.getByLabel('Allowed root domains, one per line').fill('example.com');await d.getByRole('button',{name:'Save connection',exact:true}).click();await d.getByRole('status').filter({hasText:'Connection saved'}).waitFor();
await d.getByRole('button',{name:'Check connection',exact:true}).click();await d.getByText('Connection available',{exact:true}).waitFor();check(await d.getByText('macOS · Certificate index',{exact:true}).isVisible(),'Real local health is readable rather than JSON');
check(await d.locator('pre').count()===0,'Health does not expose a JSON dump');
await d.getByLabel('Allowed root domains, one per line').fill('example.org');await d.getByRole('button',{name:'Collect & review',exact:true}).click();check(await d.getByRole('button',{name:'Run passive collection'}).isDisabled(),'Unsaved edits block collection');
await d.getByRole('button',{name:'Edit connection'}).click();await d.getByLabel('Allowed root domains, one per line').fill('example.com');
await d.getByRole('button',{name:'Continue to collection'}).click();check(await d.getByText('No collections in this case yet.').isVisible(),'Empty collection state explains next step');
check(await d.locator('option[value="theharvester_crtsh"]').evaluate(el=>el.disabled),'Unsupported Kali profile is disabled');
await d.getByLabel('Target domain',{exact:true}).fill('evil.org');await d.getByRole('button',{name:'Run passive collection'}).click();await d.getByRole('alert').filter({hasText:'inside the saved allowed domains'}).waitFor();report.checks.push('Out-of-scope target is rejected before collection');
await app.evaluate(async({ipcMain})=>{ipcMain.removeHandler('recon:health');ipcMain.handle('recon:health',()=>{throw Error('Test connection unavailable. Check the saved host.');});});
await d.getByRole('button',{name:'Recheck connection'}).click();await d.getByRole('alert').filter({hasText:'Test connection unavailable'}).waitFor();check(await d.getByRole('button',{name:'Run passive collection'}).isDisabled(),'Failed health check revokes collection readiness');
await app.evaluate(async({ipcMain,app},{repo,workspace})=>{
 const localRequire=process.getBuiltinModule('module').createRequire(repo+'/package.json');
 const {ReconBroker}=localRequire(repo+'/dist-mcp/electron/recon/broker.js');
 const {callRunner}=localRequire(repo+'/dist-mcp/electron/recon/client.js');
 const broker=new ReconBroker({workspace:()=>workspace,profile:app.getPath('userData'),localServer:repo+'/dist-mcp/mcp/kali-server.js',nodeExecutable:process.execPath,fixture:true,call:async(...args)=>{if(args[3]==='kali_collect_domain')await new Promise(resolve=>setTimeout(resolve,1200));args[5].throwIfAborted();return callRunner(...args);}});
 globalThis.traceUxFixtureBroker=broker;
 const handlers={'recon:health':()=>broker.health(),'recon:startJob':(_e,r)=>broker.start(r),'recon:listJobs':(_e,c)=>broker.list(c),'recon:cancelJob':(_e,c,id)=>broker.cancel(c,id),'recon:acceptJob':(_e,c,id,domains)=>broker.accept(c,id,domains),'recon:readArtifact':(_e,c,id)=>broker.readArtifact(c,id)};
 for(const [name,handler] of Object.entries(handlers)){ipcMain.removeHandler(name);ipcMain.handle(name,handler);}
 app.on('before-quit',()=>broker.stop());
},{repo,workspace:env.TRACE_WORKSPACE_PATH});
await d.getByRole('button',{name:'Check connection',exact:true}).click();await d.getByRole('status').filter({hasText:'Connection checked'}).waitFor();
await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('recon:listJobs');ipcMain.handle('recon:listJobs',()=>{throw Error('Synthetic refresh failure');});});
await d.getByRole('alert').filter({hasText:'Could not refresh case records'}).waitFor();await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('recon:listJobs');ipcMain.handle('recon:listJobs',(_e,id)=>globalThis.traceUxFixtureBroker.list(id));});await d.getByRole('button',{name:'Retry refresh'}).click();await d.getByRole('button',{name:'Retry refresh'}).waitFor({state:'hidden'});report.checks.push('Refresh error offers working recovery');
await d.getByLabel('Target domain',{exact:true}).fill('example.com');await d.getByRole('button',{name:'Run passive collection'}).click();await d.getByRole('button',{name:'Cancel collection'}).click();await d.getByText('Cancelled',{exact:true}).waitFor();report.checks.push('Cancel action stops a running collection without import');
await d.getByLabel('Target domain',{exact:true}).fill('example.com');await d.getByRole('button',{name:'Run passive collection'}).click();await d.getByText('Select candidate domains to import',{exact:true}).waitFor({timeout:15000});check(await d.getByText('Synthetic test data. These are not real findings.').isVisible(),'Synthetic runner output is visibly labelled');
await d.getByLabel('Filter domains',{exact:true}).fill('www');await d.getByRole('button',{name:'Select shown',exact:true}).click();check(await d.getByLabel('www.example.com',{exact:true}).isChecked(),'Select shown respects domain filter');
await d.getByRole('button',{name:'Clear selection'}).click();check(!await d.getByLabel('www.example.com',{exact:true}).isChecked(),'Clear selection clears candidates');
await d.getByRole('button',{name:'Select shown',exact:true}).click();await d.getByText('Evidence and provenance',{exact:true}).click();await d.getByRole('button',{name:'Review raw evidence'}).click();await d.getByRole('status').filter({hasText:'matches its recorded SHA-256'}).waitFor();
await page.addScriptTag({content:readFileSync(axePath,'utf8')});
async function scan(name){const result=await page.evaluate(async()=>window.axe.run(document.querySelector('.recon-dialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));report.scans.push({name,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({html:n.html,failureSummary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,failureSummary:n.failureSummary}))}))});check(!result.violations.length,'Accessibility scan: '+name);}
await scan('collection and raw evidence');
await d.getByText('Evidence and provenance',{exact:true}).click();await d.locator('.recon-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:root+'/attachments/trace-ux-desktop.png'});
await d.getByRole('button',{name:'Import 1 selected candidate',exact:true}).click();await d.getByRole('status').filter({hasText:'Selected candidates imported'}).waitFor();await d.getByText('Imported',{exact:true}).waitFor();
const data=await page.evaluate(id=>window.electronAPI.getProject(id),caseId);check(data.entities.length===2&&data.relationships.length===1&&data.sources.length===1,'Only selected domain plus root and evidence enter graph');check(!data.entities.some(e=>e.raw.includes('name: mail.example.com')),'Unselected domain stays outside graph');
const client=new Client({name:'ux-test',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});try{await client.connect(new StdioClientTransport({command:process.execPath,args:[repo+'/dist-mcp/mcp/trace-server.js','--workspace',env.TRACE_WORKSPACE_PATH,'--case-id',caseId,'--scope-b64',Buffer.from('["example.com"]').toString('base64')],stderr:'ignore'}));await client.callTool({name:'trace_propose_findings',arguments:{target:'example.com',domains:['proposal.example.com'],summary:'Synthetic UX test proposal. No independent verification.'}});}finally{await client.close();}
await d.getByRole('button',{name:/^Assistant access/}).click();await d.getByRole('button',{name:'Review proposed domains'}).waitFor();await d.getByRole('button',{name:'Show this case’s MCP configuration'}).click();await d.getByRole('status').filter({hasText:'configuration generated'}).waitFor();await d.getByRole('button',{name:'Copy configuration'}).click();await d.getByRole('status').filter({hasText:'configuration copied'}).waitFor();check((await app.evaluate(({clipboard})=>clipboard.readText())).includes(caseId),'Copied MCP configuration is bound to selected case');
await scan('assistant access');await d.getByRole('button',{name:'Review proposed domains'}).click();await d.getByRole('status').filter({hasText:'Proposal ready for domain selection'}).waitFor();check(await d.getByRole('button',{name:'Collect & review',exact:true}).getAttribute('aria-pressed')==='true','Staging proposal returns directly to review');await d.getByRole('button',{name:/^Assistant access/}).click();check(await d.getByText('No new proposals. Staged proposals appear in Collect & review.').isVisible(),'Staged proposal no longer appears as a new action');
await d.getByRole('button',{name:'Connection',exact:true}).click();await d.getByLabel('Runner',{exact:true}).selectOption('ssh');await d.getByLabel('SSH host or alias').fill('test-kali');await d.getByLabel('SSH username').fill('analyst');await scan('SSH draft form');
await d.getByLabel('Runner',{exact:true}).selectOption('local');
for(const width of [980,700,500,320]){
 await app.evaluate(({BrowserWindow},width)=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(300,400);w.setSize(width,820);},width);await page.waitForTimeout(100);
 const result=await d.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,bodyClient:el.querySelector('.recon-body').clientWidth,bodyScroll:el.querySelector('.recon-body').scrollWidth}));report.layouts.push({width,...result});check(result.scroll<=result.client+1&&result.bodyScroll<=result.bodyClient+1,'No dialog horizontal overflow at '+width+'px');
 await scan('connection '+width+'px');
 if(width===320)await page.screenshot({path:root+'/attachments/trace-ux-narrow.png'});
}
await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1000,820);w.webContents.setZoomFactor(2);});await page.waitForTimeout(150);
const zoomLayout=await d.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,bodyClient:el.querySelector('.recon-body').clientWidth,bodyScroll:el.querySelector('.recon-body').scrollWidth}));check(zoomLayout.scroll<=zoomLayout.client+1&&zoomLayout.bodyScroll<=zoomLayout.bodyClient+1,'No dialog horizontal overflow at 200% zoom');report.layouts.push({zoom:2,...zoomLayout});await scan('200% zoom');
for(let i=0;i<24;i++){await page.keyboard.press('Tab');check(await d.evaluate(el=>el.contains(document.activeElement)),'Keyboard remains inside dialog '+i);}
const focus=await page.evaluate(()=>{const el=document.activeElement;const style=getComputedStyle(el);return {outline:style.outlineStyle,width:style.outlineWidth};});check(focus.outline!=='none'&&parseFloat(focus.width)>=2,'Keyboard focus has a visible outline');
await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});check(await page.evaluate(()=>document.activeElement?.textContent)==='Recon & MCP','Escape restores focus to opening button');
await page.getByRole('button',{name:'Recon & MCP',exact:true}).click();await d.waitFor();await d.getByRole('button',{name:'Close',exact:true}).click();await d.waitFor({state:'hidden'});check(await page.evaluate(()=>document.activeElement?.textContent)==='Recon & MCP','Close button restores focus');
check(!report.errors.length,'No renderer errors');report.success=true;
}catch(error){report.success=false;report.error=error.stack;process.exitCode=1;try{await (await app.firstWindow()).screenshot({path:root+'/attachments/trace-ux-failure.png'});}catch{};console.error(error.stack);}finally{writeFileSync(root+'/attachments/trace-ux-verification.json',JSON.stringify(report,null,2));await app.close();}
console.log(JSON.stringify({success:report.success,checks:report.checks.length,scans:report.scans.length,layouts:report.layouts,error:report.error}));
