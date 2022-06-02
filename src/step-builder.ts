import type { TaskDeps, StepFn } from './types/task';

export class FirstStepBuilder<TDEPS extends TaskDeps> {
  public step<I, O>(name: string, step: StepFn<TDEPS, I, O>) {
    return new StepBuilder<TDEPS, I, O>([{ name, step }]);
  }
}

export class StepBuilder<TDEPS extends TaskDeps, IN = never, OUT = never> {
  constructor(public steps: { name: string; step: StepFn<TDEPS, any, any> }[]) {}

  public step<O>(name: string, step: StepFn<TDEPS, OUT, O>) {
    this.steps.push({ name, step });
    return this as unknown as StepBuilder<TDEPS, IN, O>;
  }
}

export function stepBuilder<TDEPS extends TaskDeps>() {
  return <I, O>(fn: (task: FirstStepBuilder<TDEPS>) => StepBuilder<TDEPS, I, O>) => fn(new FirstStepBuilder<TDEPS>());
}
