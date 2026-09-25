# make-synchronous

> Make an asynchronous function synchronous

**This is the wrong tool for most tasks!** Prefer async APIs whenever possible.

The benefit of this package over packages like [`deasync`](https://github.com/abbr/deasync) is that this one is not a native Node.js addon (which comes with a lot of problems). Instead, this package executes the given function synchronously in a [`worker`](https://nodejs.org/api/worker_threads.html) or [`subprocess`](https://nodejs.org/api/child_process.html).

Works in Node.js only — not the browser.

## Install

```sh
npm install make-synchronous
```

## Usage

Runs in a worker thread by default:

```js
import makeSynchronous from 'make-synchronous';

const fn = makeSynchronous(async number => {
	const {default: delay} = await import('delay');

	await delay(100);

	return number * 2;
});

console.log(fn(2));
//=> 4
```

To run in a subprocess instead:

```js
import makeSynchronous from 'make-synchronous/subprocess';

makeSynchronous(async () => {
	// Runs in a subprocess.
});
```

Subprocess execution is slower, but has the benefit of full process isolation.

## API

### makeSynchronous(asyncFunction | string)

Returns a wrapped version of the given async function or a string representation of an async function which executes synchronously. This means no other code will execute (not even async code) until the given async function is done.

The function is executed in a worker or subprocess, so you cannot access variables or imports from outside its scope. Use `await import(…)` to import dependencies inside the function. Those imports resolve from the current working directory. `import.meta` is not available inside the function, as it is compiled outside of a module.

Uses [`MessagePort#postMessage()`](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist) or the V8 serialization API to transfer arguments, return values, and errors between the worker or subprocess and the current process. Most values are supported, except functions and symbols.

Values are transferred using the structured clone algorithm, so host objects (for example `URL`) and non-cloneable values throw an error rather than being transferred. Custom error classes are flattened to plain errors on the way back, though their `name` is preserved. In the subprocess variant, the result is sent base64-encoded over stdout together with the function's own output, which limits the result to about 400 MB.

## Related

- [make-asynchronous](https://github.com/sindresorhus/make-asynchronous) - Make a synchronous function asynchronous by running it in a worker
- [sleep-synchronously](https://github.com/sindresorhus/sleep-synchronously) - Block the main thread for a given amount of time
- [make-synchronized](https://github.com/fisker/make-synchronized) - For advanced cases like fully synchronizing an existing module or needing top-level imports
