// import type { EnvVars } from './types/credentials';
// import type { SessionDepsOptions, SessionObject, SessionOptions } from './types/session';
// import type { DataApiDepsOptions, DataApiOptions } from './types/data-api';
// import type { FirstStepBuilder, StepBuilder } from './step-builder';
// import type { StepFn, TaskOptions } from './types/task';
// import { stepBuilder } from './step-builder';

// export class TaskerConfig<
//   CN extends string = never,
//   ST = Record<never, unknown>,
//   DAS extends Record<string, DataApiOptions<any, any>> = Record<never, DataApiOptions<any, any>>,
//   DAT extends Record<string, DataApiOptions<any, any>> = Record<never, DataApiOptions<any, any>>,
//   DEPS extends Record<string, any> = Record<never, any>,
//   TP extends Record<string, any> = Record<never, any>,
//   TR extends Record<string, any> = Record<never, any>
// > {
//   protected credentials = {} as Record<CN, EnvVars>;
//   protected dependencies = {} as Record<string, any>;
//   protected sessions = {} as Record<string, { deps: SessionDepsOptions; opts: SessionOptions<any> }>;
//   protected sources = {} as Record<string, { deps: DataApiDepsOptions; opts: DataApiOptions }>;
//   protected targets = {} as Record<string, { deps: DataApiDepsOptions; opts: DataApiOptions }>;
//   protected tasks = {} as Record<string, { opts: TaskOptions; steps: { name: string; step: StepFn }[] }>;

//   protected serialize() {
//     return {
//       credentials: this.credentials,
//       dependencies: this.dependencies,
//       sessions: this.sessions,
//       sources: this.sources,
//       targets: this.targets,
//       tasks: this.tasks,
//     };
//   }

//   public credentialsProvider<N extends string>(name: N, envVars: EnvVars = {}) {
//     this.credentials[name as unknown as CN] = envVars;
//     return this as unknown as TaskerConfig<CN | N, ST, DAS, DAT, DEPS, TP, TR>;
//   }

//   public dependency<N extends string, T>(name: N, value: T) {
//     this.dependencies[name] = value as unknown as DEPS[keyof DEPS];
//     return this as unknown as TaskerConfig<CN, ST, DAS, DAT, DEPS & { [name in N]: T }, TP, TR>;
//   }

//   public session<
//     N extends string,
//     T,
//     PS extends keyof ST | void,
//     C extends CN | void
//     // BZ = PS extends void ? 'PS IS VOID!' : 'PS is not void :(',
//     // BG = C extends void ? 'C IS VOID!' : 'C is not void :('
//     // X = [PS] extends [void] ? 'PS is undefined' : [PS] extends [never] ? 'PS is never' : 'PS is keyof ST',
//     // Y = [C] extends [void] ? 'C is undefined' : [C] extends [never] ? 'C is never' : 'C is keyof ST'
//     // Y = PS extends keyof ST ? { parentSession: SessionObject<ST[PS]> } : unknown,
//     // Z = C extends CN ? { validateCredentials: (valid: boolean) => any } : unknown
//   >(
//     name: N,
//     dependencies: { parent?: PS; credentials?: C },
//     options: SessionOptions<T & (PS extends keyof ST ? { parentSession: SessionObject<ST[PS]> } : unknown)>
//   ) {
//     this.sessions[name] = { deps: dependencies, opts: options };
//     return this as unknown as TaskerConfig<CN, ST & { [name in N]: T }, DAS, DAT, DEPS, TP, TR>;
//   }

//   public source<
//     N extends string,
//     SN extends keyof ST | undefined,
//     D extends keyof DEPS,
//     T extends DataApiOptions<SN extends keyof ST ? ST[SN] : never, Pick<DEPS, D>>
//   >(name: N, dependencies: DataApiDepsOptions<SN, D>, options: T) {
//     this.sources[name] = { deps: dependencies, opts: options };
//     return this as unknown as TaskerConfig<CN, ST, DAS & { [name in N]: T }, DAT, DEPS, TP, TR>;
//   }

//   public target<
//     N extends string,
//     SN extends keyof ST | undefined,
//     D extends keyof DEPS,
//     T extends DataApiOptions<SN extends keyof ST ? ST[SN] : never, Pick<DEPS, D>>
//   >(name: N, dependencies: DataApiDepsOptions<SN, D>, options: T) {
//     this.targets[name] = { deps: dependencies, opts: options };
//     return this as unknown as TaskerConfig<CN, ST, DAS, DAT & { [name in N]: T }, DEPS, TP, TR>;
//   }

//   public task<N extends string, S extends keyof DAS, T extends keyof DAT, D extends keyof DEPS, I, O>(
//     name: N,
//     options: TaskOptions<DAS, DAT, DEPS, S, T, D>,
//     taskSteps: (
//       steps: FirstStepBuilder<{ s: Pick<DAS, S>; t: Pick<DAT, T>; d: Pick<DEPS, D> }>
//     ) => StepBuilder<{ s: Pick<DAS, S>; t: Pick<DAT, T>; d: Pick<DEPS, D> }, I, O>
//   ) {
//     this.tasks[name] = { opts: options, steps: stepBuilder<any>()(taskSteps).steps };
//     return this as unknown as TaskerConfig<CN, ST, DAS, DAT, DEPS, TP & { [name in N]: I }, TR & { [name in N]: O }>;
//   }

//   public import<
//     CN2 extends string,
//     ST2,
//     DAS2 extends Record<string, DataApiOptions<any, any>>,
//     DAT2 extends Record<string, DataApiOptions<any, any>>,
//     DEPS2,
//     TP2,
//     TR2
//   >(taskerConfig: TaskerConfig<CN2, ST2, DAS2, DAT2, DEPS2, TP2, TR2>) {
//     const { credentials, dependencies, sessions, sources, targets, tasks } = taskerConfig.serialize();
//     this.credentials = { ...this.credentials, ...credentials };
//     this.dependencies = { ...this.dependencies, ...dependencies };
//     this.sessions = { ...this.sessions, ...sessions };
//     this.sources = { ...this.sources, ...sources };
//     this.targets = { ...this.targets, ...targets };
//     this.tasks = { ...this.tasks, ...tasks };
//     return this as unknown as TaskerConfig<
//       CN & CN2,
//       ST & ST2,
//       DAS & DAS2,
//       DAT & DAT2,
//       DEPS & DEPS2,
//       TP & TP2,
//       TR & TR2
//     >;
//   }
// }
