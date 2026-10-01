import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// 受控 Hook 调度器用于重现异步读文件持有旧回调的情况，不依赖浏览器存储。
const hooks = vi.hoisted(() => ({ slots: [] as any[], index: 0 }));
vi.mock('react', () => ({
  useState(initial: any) {
    const i = hooks.index++;
    if (!(i in hooks.slots)) hooks.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[i], (next: any) => { hooks.slots[i] = typeof next === 'function' ? next(hooks.slots[i]) : next; }];
  },
  useRef(initial: any) { const i=hooks.index++; return hooks.slots[i] ??= {current:initial}; },
  useCallback: (fn: any) => fn,
  useEffect: (fn: any) => fn(),
}));
import { useLocalState } from '../src/lib/store';
import { detailReturnTarget, useRoute } from '../src/lib/router';
import type { ListProject } from '../src/lib/types';

beforeEach(() => {
  hooks.slots=[]; hooks.index=0;
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({favorites:['a'],progress:{a:{status:'doing',completed_steps:[1]}}}),setItem:vi.fn()});
});
afterEach(() => vi.unstubAllGlobals());

it('持有旧导入回调时仍保留读取期间新增的收藏与步骤', () => {
  const api=useLocalState();
  api.toggleFavorite('new'); api.toggleStep('new',2);
  api.importBackup(JSON.stringify({version:1,state:{favorites:['backup'],progress:{}}}));
  expect(hooks.slots[0].favorites).toEqual(['a','new','backup']);
  expect(hooks.slots[0].progress.new.completed_steps).toEqual([2]);
});
it('导入写入失败不更新内存中的现有记录', () => {
  const api=useLocalState(), original=hooks.slots[0];
  vi.stubGlobal('localStorage',{setItem:()=>{throw new Error('quota');}});
  expect(()=>api.importBackup(JSON.stringify({version:1,state:{favorites:['backup'],progress:{}}}))).toThrow('未导入');
  expect(hooks.slots[0]).toBe(original);
});
it('教程变化后的普通勾选与进度操作不能代替明确复核', () => {
  const api=useLocalState();
  const project={guide_version:'a'.repeat(64),guide:[{id:'b'.repeat(64),step:1}]} as ListProject;
  api.toggleStep('a',1,project); api.setProgress('a','done',project);
  expect(hooks.slots[0].progress.a).toMatchObject({status:'doing',needs_review:true});
  api.reviewGuide('a',project); api.setProgress('a','done',project);
  expect(hooks.slots[0].progress.a).toMatchObject({status:'done',needs_review:false});
});
it('历史返回到旧详情时仍返回该详情的原关注列表', () => {
  let listener=()=>{}, index=0, stack=[{hash:'#/watchlist',state:null as any}];
  const location={hash:'#/watchlist',href:'http://local/#/watchlist'};
  vi.stubGlobal('window',{location,history:{get state(){return stack[index].state;},replaceState(state:any){stack[index].state=state;}},addEventListener:(_:string,fn:()=>void)=>{listener=fn;},removeEventListener:()=>{}});
  useRoute();
  const visit=(hash:string)=>{stack=stack.slice(0,index+1); stack.push({hash,state:null});index++;location.hash=hash;location.href='http://local/'+hash;listener();};
  const back=()=>{index--;location.hash=stack[index].hash;listener();};
  visit('#/project/a');visit('#/latest');visit('#/project/b');back();back();
  expect(detailReturnTarget()).toBe('#/watchlist');
});
