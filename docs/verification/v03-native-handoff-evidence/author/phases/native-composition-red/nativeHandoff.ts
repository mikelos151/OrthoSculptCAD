/** G1b1b trusted input-handoff composition only; not source admission or App integration. */
import { createNativeLedger } from './resourceLedger';
import type { Lease, Limits, Ref } from './resourceLedger';
export type InputRole = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface NativeRequest { readonly nativeRequestBrand: unique symbol }
export interface NativeInput { readonly ref: Ref; readonly role: InputRole }
export function createNativeHandoff(limits?: Limits) {
  const { ledger } = createNativeLedger(limits), mainRealm = ledger.createRealm();
  return Object.freeze({ ledger, mainRealm,
    submit(_lease: Lease, _input: readonly NativeInput[]): NativeRequest | { readonly ok: false; readonly code: 'BUSY' | 'BUDGET' } {
      throw Object.assign(new Error('Native START unavailable'), { code: 'UNAVAILABLE' });
    },
    wait(_handle: NativeRequest): Promise<void> { throw Error('Unavailable'); },
    accept(_handle: NativeRequest, _consumer: Lease): { refs: readonly Ref[]; buffers: readonly ArrayBuffer[] } { throw Error('Unavailable'); },
    release(_handle: NativeRequest): void { throw Error('Unavailable'); },
    dispose(): void {},
  });
}
