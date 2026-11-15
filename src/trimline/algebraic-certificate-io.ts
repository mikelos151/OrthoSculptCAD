import type { ArithmeticContext } from './numerics';
import { verifyAlgebraicCertificate, type AlgebraicCertificateResult } from './algebraic-certificate';
export type CertificateExport=AlgebraicCertificateResult & {readonly json?:string};
export function exportAlgebraicCertificate(input:unknown,source:unknown,ctx:ArithmeticContext):CertificateExport {
 const result=verifyAlgebraicCertificate(input,source,ctx);if(result.status!=='PASS')return result;
 // Validation has excluded own accessors, toJSON hooks and non-data arrays.
 const json=JSON.stringify(input);if(json.length>1048576)return Object.freeze({status:'UNKNOWN',reason:'TEXT_LIMIT'});
 return Object.freeze({...result,json});
}
/** File ingress: bound text BEFORE JSON allocation. Canonical JSON requirement also
 * excludes duplicate fields; no compatibility aliases or alternate field names.
 * Object API is for caller-owned data, not a JS Proxy / realm isolation sandbox.
 */
export function importAlgebraicCertificate(text:unknown,source:unknown,ctx:ArithmeticContext):AlgebraicCertificateResult {
 if(typeof text!=='string'||text.length>1048576)return Object.freeze({status:'UNKNOWN',reason:'TEXT_LIMIT'});
 let input:unknown;try{input=JSON.parse(text);if(JSON.stringify(input)!==text)return Object.freeze({status:'UNKNOWN',reason:'NONCANONICAL_JSON'});}catch{return Object.freeze({status:'UNKNOWN',reason:'JSON'});}
 return verifyAlgebraicCertificate(input,source,ctx);
}
