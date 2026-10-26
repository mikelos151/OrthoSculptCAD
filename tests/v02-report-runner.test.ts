import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('does not depend on an expiring developer-specific Python path',()=>{
 const source=readFileSync(new URL('../scripts/verify-review-report.mjs',import.meta.url),'utf8');
 expect(source).not.toContain('C:/Users/');
 expect(source).toContain('REPORT_PDF_PYTHON');
});
