import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {runChromiumSurface} from './rendered-surface-checks.mjs';
import {installedBrowsers} from './browser-platform.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.AGENT_WORKING_DIR;
if(!output) throw new Error('Run branding verification through the checked working-area launcher.');
const results=[];
const selectedBrowser=process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser')+1] : null;
for(const {browser,binary,chromium} of await installedBrowsers()) {
  if(!binary||!chromium||(selectedBrowser&&selectedBrowser!==browser)) continue;
  for(const width of process.argv.includes('--quick')?[1280]:[1280,640]) {
    const result=await runChromiumSurface(binary,path.join(root,'teams-captions-saver'),path.join(output,`${browser}-${width}.png`),{
      viewportForSurface:surface=>({width:surface==='popup'?364:width,height:surface==='popup'?600:900}),
      afterSurface:async(surface,cdp)=>{
        if(surface!=='settings') return;
        for(const theme of ['captionkeep','light']) {
          await cdp.send('Runtime.evaluate',{expression:`CaptionKeepTheme.apply(${JSON.stringify(theme)});window.scrollTo(0,0)`});
          await new Promise(resolve=>setTimeout(resolve,200));
          const capture=await cdp.send('Page.captureScreenshot',{format:'png'});
          await writeFile(path.join(output,`${browser}-${width}-${theme}.png`),Buffer.from(capture.data,'base64'));
        }
      }
    });
    results.push({browser,width,checks:result.checks});
    await writeFile(path.join(output,'branding-rendered-results.json'),JSON.stringify(results,null,2)+'\n');
    console.log(JSON.stringify({browser,width,passed:result.checks.length}));
  }
}
if(!results.length) throw new Error('No installed Chromium browser completed branding verification.');
await writeFile(path.join(output,'branding-rendered-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(`Branding evidence: ${output}`);
