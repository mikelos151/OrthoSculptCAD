"""Executable SPEC ONLY: no production imports, Worker, transport or native proof."""
def main_gate(t0, now):
    return t0 <= now < t0 + 120000

def classify(state, frame, now):
    if frame['binding'] != state['binding']:
        return 'ignore-old-binding'
    # schema means the already-validated closed envelope, not a wire decoder.
    if not frame['schema'] or frame['auth'] != state['auth']:
        return 'fault'
    request, signature = frame['request'], frame['signature']
    if state['revoking'] and request == state['cleanup'] and signature == ('RELEASED',0,()):
        return 'deadline-terminal' if now >= state['grace'] else 'accept-cleanup-terminal'
    if request == state['retired'] and signature in state['retired_expected']:
        return 'ignore-last-retired'
    if request != state['current'] or state['current'] is None:
        return 'fault'
    if state['revoking'] or signature not in state['expected'] or signature[0] in state['seen']:
        return 'fault'
    if not main_gate(state['t0'], now):
        return 'deadline-terminal'
    return 'accept-current'

def grace_end(revoke_now, active_deadline=None):
    return revoke_now + 1000 if active_deadline is None else min(revoke_now + 1000, active_deadline)

