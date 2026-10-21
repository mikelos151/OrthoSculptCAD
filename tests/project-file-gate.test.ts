import {it,expect} from 'vitest';
import {projectFileSizeAllowed} from '../src/components/workflow';
it('rejects oversized projects before calling File.text and allocating the string',()=>{
 expect(projectFileSizeAllowed(128*1024*1024)).toBe(true);
 expect(projectFileSizeAllowed(128*1024*1024+1)).toBe(false);
 expect(projectFileSizeAllowed(0)).toBe(false);
 expect(projectFileSizeAllowed(NaN)).toBe(false);
 expect(projectFileSizeAllowed(-1)).toBe(false);
});
