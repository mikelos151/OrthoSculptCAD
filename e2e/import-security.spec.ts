import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {savePlainDownload,replaceSyntheticProject} from './helpers';
const ply=`ply
format ascii 1.0
comment SYNTHETIC engineering test triangle, units millimeter
element vertex 3
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 1
property list uchar int vertex_indices
end_header
0 0 0 255 0 0
40 0 0 0 255 0
0 40 40 0 0 255
3 0 1 2
`;
test('coloured PLY import preserves RGB through project download and blocks invalid input',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Wybierz skan i lokalne tekstury').setInputFiles({name:'SYNTHETIC-rgb.ply',mimeType:'application/octet-stream',buffer:Buffer.from(ply)});
 await expect(page.getByText('SYNTHETIC-rgb.ply',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Potwierdź i przelicz na mm'}).click();
 const download=await savePlainDownload(page);const data=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(data.mesh.colors).toEqual([1,0,0,0,1,0,0,0,1]);
 expect(data.mesh.positions).toEqual([0,0,0,40,0,0,0,40,40]);
 await page.getByLabel('Wybierz skan i lokalne tekstury').setInputFiles({name:'bad.ply',mimeType:'application/octet-stream',buffer:Buffer.from(ply.replace('40 0 0','NaN 0 0'))});
 await replaceSyntheticProject(page);
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.locator('.filename')).toContainText('SYNTHETIC-rgb.ply');
});
test('OBJ references cannot trigger external texture requests',async({page})=>{
 const remote:string[]=[];page.on('request',r=>{if(r.url().includes('malicious.invalid'))remote.push(r.url());});
 await page.goto('/');
 const obj='mtllib scan.mtl\nv 0 0 0\nv 20 0 0\nv 0 20 20\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl skin\nf 1/1 2/2 3/3\n';
 const mtl='newmtl skin\nmap_Kd https://malicious.invalid/patient.png\n';
 await page.getByLabel('Wybierz skan i lokalne tekstury').setInputFiles([{name:'scan.obj',mimeType:'text/plain',buffer:Buffer.from(obj)},{name:'scan.mtl',mimeType:'text/plain',buffer:Buffer.from(mtl)}]);
 await expect(page.getByRole('alert')).toBeVisible();expect(remote).toEqual([]);
 await expect(page.getByRole('button',{name:'Najpierw potwierdź jednostki'})).toBeDisabled();
});
test('oversized project metadata is rejected before File.text is called',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{
  const file=new File(['{}'],'oversized.oscad.json',{type:'application/json'});
  Object.defineProperty(file,'size',{value:128*1024*1024+1});
  const state=globalThis as unknown as {projectReads:number};state.projectReads=0;
  file.text=async()=>{state.projectReads++;return '{}';};
  const transfer=new DataTransfer();transfer.items.add(file);
  const input=document.querySelector('input[aria-label="Wybierz zapisany projekt"]') as HTMLInputElement;
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await expect(page.getByRole('alert')).toContainText('przekracza limit odczytu');
 expect(await page.evaluate(()=>(globalThis as unknown as {projectReads:number}).projectReads)).toBe(0);
});
test('tablet layout does not overflow viewport and retains all five stages',async({page},testInfo)=>{
 await page.setViewportSize({width:1024,height:768});await page.goto('/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 expect(await page.locator('.step-button').count()).toBe(5);
 await page.getByRole('button',{name:'Otwórz przykład',exact:true}).click();
 await expect(page.getByText('Dane syntetyczne',{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('tablet.png'),fullPage:true});
});
