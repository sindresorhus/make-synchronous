import type {AsyncReturnType} from 'type-fest';

// TODO: Move these to https://github.com/sindresorhus/type-fest
type AnyAsyncFunction = (...argumentsList: any[]) => Promise<unknown | void>;
type ReplaceReturnType<T extends (...arguments_: any) => unknown, NewReturnType> = (...arguments_: Parameters<T>) => NewReturnType;

/**
Returns a wrapped version of the given async function or a string representation of an async function which executes synchronously. This means no other code will execute (not even async code) until the given async function is done.

The function is executed in a worker or subprocess, so you cannot access variables or imports from outside its scope. Use `await import(…)` to import dependencies inside the function. Those imports resolve from the current working directory. `import.meta` is not available inside the function, as it is compiled outside of a module.

Uses [`MessagePort#postMessage()`](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist) or the V8 serialization API to transfer arguments, return values, and errors between the worker or subprocess and the current process. Most values are supported, except functions and symbols.

Values are transferred using the structured clone algorithm, so host objects (for example `URL`) and non-cloneable values throw an error rather than being transferred. Custom error classes are flattened to plain errors on the way back, though their `name` is preserved. In the subprocess variant, the result is sent base64-encoded over stdout together with the function's own output, which limits the result to about 400 MB.

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
