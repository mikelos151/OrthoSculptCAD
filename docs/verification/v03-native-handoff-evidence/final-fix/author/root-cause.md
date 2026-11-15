# Root cause, ranked hypotheses before edits
1. Q2: pool stop removes two listeners in one unprotected sequence; first throw prevents second removal and native terminate. Predict cleanup position 4/5 fails with terminate=0 and occupied slot.
2. B1: dispose reentered from facade cleanup calls pool.dispose while original stopWorker owns completion; native E is caught as cleanup and replaced by snapshot-derived NATIVE_TERMINATE. Predict exact E mismatch only for facade cleanup disposal, not native terminate reentry.
3. Q1 regression alternative: return publication after revoke. Already independently closed; retain legacy tests and unchanged witnesses.
No change to authority, ABI, resourceLedger, endpoint, source admission, App, dependencies or product architecture.
