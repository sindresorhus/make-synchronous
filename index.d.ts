import type {AsyncReturnType} from 'type-fest';

// TODO: Move these to https://github.com/sindresorhus/type-fest
type AnyAsyncFunction = (...argumentsList: any[]) => Promise<unknown | void>;
type ReplaceReturnType<T extends (...arguments_: any) => unknown, NewReturnType> = (...arguments_: Parameters<T>) => NewReturnType;

/**
Returns a wrapped version of the given async function or a string representation to a async function which executes synchronously. This means no other code will execute (not even async code) until the given async function is done.

The function is executed in a worker or subprocess, so you cannot access variables or imports from outside its scope. Use `await import(…)` to import dependencies inside the function.

Uses [`MessagePort#postMessage()`](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist) or the V8 serialization API to transfer arguments, return values, errors between the worker or subprocess and the current process. Most values are supported — except functions and symbols.

@example
```
import makeSynchronous from 'make-synchronous';

const fn = makeSynchronous(async number => {
	const {default: delay} = await import('delay');

	await delay(100);

	return number * 2;
});

console.log(fn(2));
//=> 4
```

@example
```
import makeSynchronous from 'make-synchronous/subprocess';

makeSynchronous(async () => {
	// Runs in a subprocess.
});
```
*/
export default function makeSynchronous<T extends AnyAsyncFunction = AnyAsyncFunction>(asyncFunction: T | string): ReplaceReturnType<T, AsyncReturnType<T>>;
