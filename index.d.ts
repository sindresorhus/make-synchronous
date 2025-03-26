import type {AsyncReturnType} from 'type-fest';

// TODO: Move these to https://github.com/sindresorhus/type-fest
type AnyAsyncFunction = (...argumentsList: any[]) => Promise<unknown | void>;
type ReplaceReturnType<T extends (...arguments_: any) => unknown, NewReturnType> = (...arguments_: Parameters<T>) => NewReturnType;

/**
Returns a wrapped version of the given async function or a string representation to a async function which executes synchronously. This means no other code will execute (not even async code) until the given async function is done.

The given function is executed in a worker, so you cannot use any variables/imports from outside the scope of the function. You can pass in arguments to the function. To import dependencies, use `await import(…)` in the function body.

It uses the [`MessagePort#postMessage()`](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist) API to transfer arguments, return values, errors between the worker thread and the current process. It supports most values, but not functions and symbols.

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
*/
export default function makeSynchronous<T extends AnyAsyncFunction = AnyAsyncFunction>(asyncFunction: T | string): ReplaceReturnType<T, AsyncReturnType<T>>;
