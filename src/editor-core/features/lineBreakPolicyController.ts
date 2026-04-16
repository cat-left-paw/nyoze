import type { LineBreakPolicy } from '../types'

type LogPush = (event: string, detail: string) => void

type CreateLineBreakPolicyControllerOptions = {
  initialPolicy: LineBreakPolicy
  pushLog: LogPush
  emitLineBreakPolicyChange: (nextPolicy: LineBreakPolicy) => void
}

export function createLineBreakPolicyController({
  initialPolicy,
  pushLog,
  emitLineBreakPolicyChange,
}: CreateLineBreakPolicyControllerOptions): {
  getLineBreakPolicy: () => LineBreakPolicy
  setLineBreakPolicy: (nextPolicy: LineBreakPolicy) => LineBreakPolicy
} {
  let lineBreakPolicy = initialPolicy

  function getLineBreakPolicy(): LineBreakPolicy {
    return lineBreakPolicy
  }

  function setLineBreakPolicy(nextPolicy: LineBreakPolicy): LineBreakPolicy {
    if (nextPolicy === lineBreakPolicy) return lineBreakPolicy
    lineBreakPolicy = nextPolicy
    pushLog('lineBreakPolicy', nextPolicy)
    emitLineBreakPolicyChange(nextPolicy)
    return lineBreakPolicy
  }

  return {
    getLineBreakPolicy,
    setLineBreakPolicy,
  }
}
